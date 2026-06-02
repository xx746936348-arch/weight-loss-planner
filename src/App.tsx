import {
  Activity,
  Archive,
  BookOpen,
  Calculator,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  ChevronLeft,
  Copy,
  Flame,
  HeartPulse,
  Home,
  Save,
  Scale,
  Settings,
  Sparkles,
  Target,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Plan = {
  name: string;
  startDate: string;
  endDate: string;
  currentWeight: number;
  goalWeight: number;
  bmr: number;
  activityLevel: string;
  activityCalories: number;
  targetDeficit: number;
  minimumCalories: number;
  attachments?: PlanAttachments;
};

type PlanStatus = "Completed" | "Stopped Early" | "Archived";

type StoredFile = {
  name: string;
  type: string;
  dataUrl: string;
  uploadedAt: string;
};

type BodyPhotoSlot = "front" | "side" | "back";

type PlanAttachments = {
  reports: {
    before?: StoredFile;
    after?: StoredFile;
  };
  photos: {
    before: Partial<Record<BodyPhotoSlot, StoredFile>>;
    after: Partial<Record<BodyPhotoSlot, StoredFile>>;
  };
};

type PlanHistory = {
  id: string;
  planName: string;
  startDate: string;
  endDate: string;
  startWeight: number;
  endWeight: number;
  goalWeight: number;
  totalWeightChange: number;
  goalProgressPercentage: number;
  averageDailyCalorieIntake: number;
  averageDailyExerciseCalories: number;
  averageDailyCalorieDeficit: number;
  daysRecorded: number;
  goalMetDays: number;
  status: PlanStatus;
  summary: string;
  logs: DailyLog[];
  archivedAt: string;
  attachments?: PlanAttachments;
};

type Today = {
  foodCalories: number;
  exerciseCalories: number;
  weight: number;
};

type DailyEntry = {
  id: string;
  date: string;
  type: "food" | "exercise";
  calories: number;
  note: string;
  createdAt: string;
};

type DailyLog = Today & {
  date: string;
  actualDeficit: number;
};

type Tab = "setup" | "today" | "progress" | "history" | "tools" | "settings";

const planKey = "daily-burn-plan:plan";
const todayKey = "daily-burn-plan:today";
const logsKey = "daily-burn-plan:logs";
const entriesKey = "daily-burn-plan:entries";
const activePlanKey = "daily-burn-plan:active";
const planHistoryKey = "daily-burn-plan:history";

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatChineseDate(value: string) {
  const date = parseLocalDate(value);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function createPlanName(startDate: string) {
  return `${formatChineseDate(startDate)}减肥计划`;
}

const defaultGoalDate = new Date();
defaultGoalDate.setDate(defaultGoalDate.getDate() + 30);

const activityLevels = [
  {
    id: "sedentary",
    label: "久坐",
    description: "大部分时间坐着，日常步数通常少于 5,000 步。",
    calories: 200,
  },
  {
    id: "light",
    label: "轻度活动",
    description: "每天有一些通勤或散步，日常步数大约 5,000-8,000 步。",
    calories: 300,
  },
  {
    id: "moderate",
    label: "中度活动",
    description: "经常走动或站立，日常步数大约 8,000-12,000 步。",
    calories: 400,
  },
  {
    id: "very",
    label: "高活动量",
    description: "日常步数通常超过 12,000 步，或工作中需要频繁站立、走动。",
    calories: 500,
  },
];

const defaults: Plan = {
  name: createPlanName(localDateString()),
  startDate: localDateString(),
  endDate: localDateString(defaultGoalDate),
  currentWeight: 56,
  goalWeight: 50,
  bmr: 1310,
  activityLevel: "light",
  activityCalories: 300,
  targetDeficit: 900,
  minimumCalories: 1100,
  attachments: emptyAttachments(),
};

const todayDefaults: Today = {
  foodCalories: 1200,
  exerciseCalories: 200,
  weight: 56,
};

function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function normalizePlan(plan: Partial<Plan> & { goalDate?: string }): Plan {
  const startDate = plan.startDate ?? defaults.startDate;
  const activityLevel =
    activityLevels.find((item) => item.id === plan.activityLevel)?.id ??
    activityLevels.find((item) => item.calories === plan.activityCalories)?.id ??
    defaults.activityLevel;
  const activityCalories =
    activityLevels.find((item) => item.id === activityLevel)?.calories ?? defaults.activityCalories;

  return {
    ...defaults,
    ...plan,
    name: plan.name && plan.name !== "我的减重计划" ? plan.name : createPlanName(startDate),
    startDate,
    endDate: plan.endDate ?? plan.goalDate ?? defaults.endDate,
    activityLevel,
    activityCalories,
    attachments: normalizeAttachments(plan.attachments),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function calcRequiredExercise(plan: Plan, foodCalories: number) {
  return Math.max(0, foodCalories + plan.targetDeficit - plan.bmr - plan.activityCalories);
}

function calcActualDeficit(plan: Plan, today: Today) {
  return plan.bmr + plan.activityCalories + today.exerciseCalories - today.foodCalories;
}

function getEntriesForDate(entries: DailyEntry[], date: string) {
  return entries.filter((entry) => entry.date === date);
}

function totalsFromEntries(entries: DailyEntry[]) {
  return entries.reduce(
    (totals, entry) => {
      if (entry.type === "food") totals.foodCalories += entry.calories;
      if (entry.type === "exercise") totals.exerciseCalories += entry.calories;
      return totals;
    },
    { foodCalories: 0, exerciseCalories: 0 },
  );
}

function upsertDailyLog(plan: Plan, logs: DailyLog[], date: string, totals: Today) {
  const log: DailyLog = {
    date,
    weight: totals.weight,
    foodCalories: totals.foodCalories,
    exerciseCalories: totals.exerciseCalories,
    actualDeficit: calcActualDeficit(plan, totals),
  };

  return [log, ...logs.filter((item) => item.date !== date)];
}

function daysSincePlanStart(plan: Plan) {
  const start = parseLocalDate(plan.startDate).getTime();
  const today = parseLocalDate(localDateString()).getTime();
  return Math.max(0, Math.round((today - start) / (24 * 60 * 60 * 1000)));
}

function shouldWeighIn(plan: Plan, logs: DailyLog[]) {
  const dayIndex = daysSincePlanStart(plan);
  if (dayIndex === 0 || dayIndex % 7 !== 0) return false;
  return !logs.some((log) => log.date === localDateString());
}

function nextWeighInDate(plan: Plan) {
  const dayIndex = daysSincePlanStart(plan);
  const nextOffset = dayIndex === 0 ? 7 : Math.ceil((dayIndex + 1) / 7) * 7;
  const next = new Date(parseLocalDate(plan.startDate).getTime() + nextOffset * 24 * 60 * 60 * 1000);
  return localDateString(next);
}

function createReviewPrompt(plan: Plan, logs: DailyLog[]) {
  const recentLogs = [...logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const latest = recentLogs[0];
  const previous = recentLogs[recentLogs.length - 1];
  const weightChange =
    latest && previous && latest.date !== previous.date ? round(previous.weight - latest.weight, 2) : "暂时不足";

  return `我想请你帮我看一下我的减肥计划是不是需要调整，语气可以直接一点、像朋友一样说清楚。

我的基本计划：
- 计划名称：${plan.name}
- 开始日期：${plan.startDate}
- 结束日期：${plan.endDate}
- 起始体重：${plan.currentWeight} kg
- 目标体重：${plan.goalWeight} kg
- BMR：${plan.bmr} kcal
- 日常活动消耗：${plan.activityCalories} kcal
- 目标每日热量缺口：${plan.targetDeficit} kcal
- 最低每日摄入：${plan.minimumCalories} kcal

最近记录：
- 最近 ${recentLogs.length} 天平均摄入：${round(average(recentLogs.map((log) => log.foodCalories)))} kcal
- 最近 ${recentLogs.length} 天平均运动消耗：${round(average(recentLogs.map((log) => log.exerciseCalories)))} kcal
- 最近 ${recentLogs.length} 天平均热量缺口：${round(average(recentLogs.map((log) => log.actualDeficit)))} kcal
- 最近体重变化：${weightChange} kg

我现在的情况/感受：
- 我已经执行这个计划大约 ${daysSincePlanStart(plan)} 天
- 我觉得饿不饿：
- 精神状态：
- 睡眠：
- 有没有很难坚持：
- 有没有明明很努力但体重没怎么动：

请你帮我生成一个简短报告：
1. 我现在是不是在合理减脂
2. 如果体重没下降，可能是什么原因（水肿、周期、记录误差、缺口不够、吃太少等）
3. 我应不应该调高或调低每日热量缺口
4. 我应不应该增加运动，还是先保持
5. 如果我太饿或状态差，应该怎么改
6. 接下来 7 天我具体怎么做

请用简单表格 + 几句人话建议回答，不要太长。`;
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  description,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  description?: string;
  min?: number;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-zinc-600">{label}</span>
      <div className="flex items-center rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm focus-within:border-rose-300 focus-within:ring-4 focus-within:ring-rose-100">
        <input
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-zinc-900 outline-none"
          inputMode="decimal"
          min={min}
          type="number"
          value={Number.isFinite(value) ? value : 0}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix ? <span className="ml-2 text-sm font-medium text-zinc-400">{suffix}</span> : null}
      </div>
      {description ? <span className="mt-1.5 block text-xs leading-5 text-zinc-500">{description}</span> : null}
    </label>
  );
}

function QuickNumberField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-zinc-600">{label}</span>
      <div className="flex items-center rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm focus-within:border-rose-300 focus-within:ring-4 focus-within:ring-rose-100">
        <input
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-zinc-900 outline-none"
          inputMode="decimal"
          min={0}
          placeholder="输入数字"
          type="number"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix ? <span className="ml-2 text-sm font-medium text-zinc-400">{suffix}</span> : null}
      </div>
    </label>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-zinc-100 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  tone = "zinc",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "zinc" | "rose" | "emerald";
}) {
  const tones = {
    zinc: "bg-zinc-50 text-zinc-700",
    rose: "bg-rose-50 text-rose-700",
    emerald: "bg-emerald-50 text-emerald-700",
  };

  return (
    <div className={`rounded-lg p-3 ${tones[tone]}`}>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-black tracking-tight">{value}</div>
    </div>
  );
}

function SetupScreen({
  plan,
  setPlan,
  onSave,
  hasActivePlan,
  onArchivePlan,
}: {
  plan: Plan;
  setPlan: (plan: Plan) => void;
  onSave: () => void;
  hasActivePlan: boolean;
  onArchivePlan: (status: PlanStatus) => void;
}) {
  const selectedActivity =
    activityLevels.find((item) => item.id === plan.activityLevel) ?? activityLevels[1];
  const planDays = daysBetweenInclusive(plan.startDate, plan.endDate);
  const canAdjustPlan = daysSincePlanStart(plan) >= 7;
  const firstAdjustDate = localDateString(new Date(parseLocalDate(plan.startDate).getTime() + 7 * 24 * 60 * 60 * 1000));

  if (hasActivePlan) {
    return (
      <div className="space-y-4">
        <Card>
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <BookOpen size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black text-zinc-900">当前计划进行中</h2>
              <p className="text-sm text-zinc-500">保存计划后，这里会锁定为当前计划。要建立新计划，需要先终止当前计划。</p>
            </div>
          </div>
          <div className="rounded-lg bg-zinc-50 p-4">
            <p className="text-sm font-bold text-rose-500">{plan.name}</p>
            <h3 className="mt-1 text-2xl font-black text-zinc-950">
              {round(plan.currentWeight - plan.goalWeight, 1)} kg 目标
            </h3>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-zinc-400">开始</p>
                <p className="font-bold text-zinc-800">{plan.startDate}</p>
              </div>
              <div>
                <p className="text-zinc-400">结束</p>
                <p className="font-bold text-zinc-800">{plan.endDate}</p>
              </div>
              <div>
                <p className="text-zinc-400">当前体重</p>
                <p className="font-bold text-zinc-800">{round(plan.currentWeight, 1)} kg</p>
              </div>
              <div>
                <p className="text-zinc-400">目标体重</p>
                <p className="font-bold text-zinc-800">{round(plan.goalWeight, 1)} kg</p>
              </div>
              <div>
                <p className="text-zinc-400">日常活动</p>
                <p className="font-bold text-zinc-800">
                  {selectedActivity.label} · {selectedActivity.calories} kcal
                </p>
              </div>
              <div>
                <p className="text-zinc-400">计划天数</p>
                <p className="font-bold text-zinc-800">{planDays} 天</p>
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            如果你想重新设置一个新计划，请先终止当前计划。当前计划会保存到「计划日志」里，之后仍然可以查看。
          </div>
          <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <div className="mb-3">
              <h3 className="text-base font-black text-zinc-900">计划调整</h3>
              <p className="mt-1 text-sm leading-6 text-zinc-500">
                建议至少观察 7 天再调整，不要每天因为体重波动改计划。
              </p>
            </div>
            {canAdjustPlan ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberField
                    label="目标每日热量缺口"
                    suffix="kcal"
                    value={plan.targetDeficit}
                    onChange={(targetDeficit) => setPlan({ ...plan, targetDeficit })}
                  />
                  <NumberField
                    label="每日最低摄入"
                    suffix="kcal"
                    value={plan.minimumCalories}
                    onChange={(minimumCalories) => setPlan({ ...plan, minimumCalories })}
                  />
                </div>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-600">日常活动等级</span>
                  <select
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base font-semibold text-zinc-900 shadow-sm outline-none focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
                    value={plan.activityLevel}
                    onChange={(event) => {
                      const activity = activityLevels.find((item) => item.id === event.target.value) ?? activityLevels[1];
                      setPlan({ ...plan, activityLevel: activity.id, activityCalories: activity.calories });
                    }}
                  >
                    {activityLevels.map((activity) => (
                      <option key={activity.id} value={activity.id}>
                        {activity.label}（{activity.calories} kcal）
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-bold text-white shadow-sm active:scale-[0.99]"
                  type="button"
                  onClick={onSave}
                >
                  保存本次调整
                </button>
              </div>
            ) : (
              <div className="rounded-lg bg-white p-3 text-sm leading-6 text-zinc-600">
                还不能调整。第一次可调整日期：{firstAdjustDate}。
              </div>
            )}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-base font-bold text-white shadow-sm active:scale-[0.99]"
              type="button"
              onClick={() => onArchivePlan("Completed")}
            >
              <Archive size={18} />
              完成计划并保存
            </button>
            <button
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-3 text-base font-bold text-red-600 shadow-sm active:scale-[0.99]"
              type="button"
              onClick={() => onArchivePlan("Stopped Early")}
            >
              <XCircle size={18} />
              提前终止并保存
            </button>
          </div>
        </Card>
        <PlanBaselineAttachments plan={plan} setPlan={setPlan} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-lg bg-rose-50 p-2 text-rose-500">
            <Settings size={22} />
          </div>
          <div>
            <h2 className="text-xl font-black text-zinc-900">计划设置</h2>
            <p className="text-sm text-zinc-500">
              手动填写计划。应用不会连接 AI，只提供可复制的提示词给你粘贴到 ChatGPT 或 Claude。
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 rounded-lg bg-zinc-50 p-3">
            <p className="text-sm font-medium text-zinc-500">计划名称</p>
            <p className="mt-1 text-xl font-black text-zinc-950">{createPlanName(plan.startDate)}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">不用手动填写，会根据开始日期自动生成。</p>
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-600">开始日期</span>
            <input
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-lg font-semibold text-zinc-900 shadow-sm outline-none focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
              type="date"
              value={plan.startDate}
              onChange={(event) => {
                const startDate = event.target.value;
                setPlan({ ...plan, startDate, name: createPlanName(startDate) });
              }}
            />
            <span className="mt-1.5 block text-xs leading-5 text-zinc-500">计划开始的日期。</span>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-600">结束日期</span>
            <input
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-lg font-semibold text-zinc-900 shadow-sm outline-none focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
              type="date"
              value={plan.endDate}
              onChange={(event) => setPlan({ ...plan, endDate: event.target.value })}
            />
            <span className="mt-1.5 block text-xs leading-5 text-zinc-500">用于估算目标剩余时间。</span>
          </label>
          <NumberField
            label="当前体重"
            suffix="kg"
            value={plan.currentWeight}
            onChange={(currentWeight) => setPlan({ ...plan, currentWeight })}
            description="今天或最近一次称重的体重。"
          />
          <NumberField
            label="目标体重"
            suffix="kg"
            value={plan.goalWeight}
            onChange={(goalWeight) => setPlan({ ...plan, goalWeight })}
            description="你希望达到的体重。"
          />
          <NumberField
            label="基础代谢"
            suffix="kcal"
            value={plan.bmr}
            onChange={(bmr) => setPlan({ ...plan, bmr })}
            description="不包含运动，只填写你的 BMR。"
          />
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-600">日常活动等级</span>
            <select
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-lg font-semibold text-zinc-900 shadow-sm outline-none focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
              value={plan.activityLevel}
              onChange={(event) => {
                const activity = activityLevels.find((item) => item.id === event.target.value) ?? activityLevels[1];
                setPlan({ ...plan, activityLevel: activity.id, activityCalories: activity.calories });
              }}
            >
              {activityLevels.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.label}（{activity.calories} kcal）
                </option>
              ))}
            </select>
            <span className="mt-1.5 block text-xs leading-5 text-zinc-500">
              {selectedActivity.description}
            </span>
            <span className="mt-1 block text-xs leading-5 text-rose-600">
              这里只算日常活动，不包括跑步、椭圆机、健身、游泳、徒步等主动运动；这些请在「今日」页单独填写。
            </span>
          </label>
          <NumberField
            label="每日目标热量缺口"
            suffix="kcal"
            value={plan.targetDeficit}
            onChange={(targetDeficit) => setPlan({ ...plan, targetDeficit })}
            description="用于计算今天还需要通过运动消耗多少热量。"
          />
          <NumberField
            label="每日最低摄入"
            suffix="kcal"
            value={plan.minimumCalories}
            onChange={(minimumCalories) => setPlan({ ...plan, minimumCalories })}
            description="如果今天摄入低于这个数字，应用会显示提醒。"
          />
        </div>
        <div className="mt-5">
          <PlanBaselineAttachments plan={plan} setPlan={setPlan} compact />
        </div>
        <button
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-base font-bold text-white shadow-sm active:scale-[0.99]"
          onClick={onSave}
        >
          <Save size={18} />
          保存计划
        </button>
      </Card>
    </div>
  );
}

function PlanBaselineAttachments({
  plan,
  setPlan,
  compact = false,
}: {
  plan: Plan;
  setPlan: (plan: Plan) => void;
  compact?: boolean;
}) {
  const attachments = normalizeAttachments(plan.attachments);

  async function uploadReport(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    const stored = await readFileAsStoredFile(file);
    setPlan({
      ...plan,
      attachments: {
        ...attachments,
        reports: {
          ...attachments.reports,
          before: stored,
        },
      },
    });
  }

  async function uploadPhoto(slot: BodyPhotoSlot, fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    const stored = await readFileAsStoredFile(file);
    setPlan({
      ...plan,
      attachments: {
        ...attachments,
        photos: {
          ...attachments.photos,
          before: {
            ...attachments.photos.before,
            [slot]: stored,
          },
        },
      },
    });
  }

  return (
    <section className={compact ? "rounded-lg border border-zinc-100 bg-zinc-50 p-3" : "rounded-lg border border-zinc-100 bg-white p-4 shadow-sm"}>
      <div className="mb-4">
        <h2 className="text-xl font-black text-zinc-900">计划前资料</h2>
        <p className="mt-1 text-sm leading-6 text-zinc-500">
          体检报告可选，身体照片至少上传一张。之后生成日志时，这些会自动带到日志里做前后对比。
        </p>
      </div>
      <ReportUpload
        file={attachments.reports.before}
        label="计划开始前体检报告"
        onChange={uploadReport}
      />
      <div className="mt-5 space-y-3">
        <h3 className="text-base font-black text-zinc-900">计划前身体照片</h3>
        <div className="grid grid-cols-3 gap-3">
          {(["front", "side", "back"] as BodyPhotoSlot[]).map((slot) => {
            const labels: Record<BodyPhotoSlot, string> = {
              front: "正面",
              side: "侧面",
              back: "背面",
            };
            return (
              <PhotoSlot
                key={slot}
                label={labels[slot]}
                file={attachments.photos.before[slot]}
                onChange={(files) => uploadPhoto(slot, files)}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TodayScreen({
  plan,
  today,
  entries,
  logs,
  onAddEntry,
  onDeleteEntry,
  onRecordWeight,
  onCopyReviewPrompt,
}: {
  plan: Plan;
  today: Today;
  entries: DailyEntry[];
  logs: DailyLog[];
  onAddEntry: (type: "food" | "exercise", calories: number, note: string) => void;
  onDeleteEntry: (id: string) => void;
  onRecordWeight: (weight: number) => void;
  onCopyReviewPrompt: () => void;
}) {
  const [foodAmount, setFoodAmount] = useState("");
  const [foodNote, setFoodNote] = useState("");
  const [riceGrams, setRiceGrams] = useState("");
  const [exerciseAmount, setExerciseAmount] = useState("");
  const [exerciseNote, setExerciseNote] = useState("");
  const [weightInput, setWeightInput] = useState(today.weight);
  const [showReview, setShowReview] = useState(false);
  const todayEntries = getEntriesForDate(entries, localDateString()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const requiredExercise = calcRequiredExercise(plan, today.foodCalories);
  const remainingExercise = requiredExercise - today.exerciseCalories;
  const actualDeficit = calcActualDeficit(plan, today);
  const estimatedFatLoss = actualDeficit / 7700;
  const weighInDue = shouldWeighIn(plan, logs);
  const nextWeighDate = nextWeighInDate(plan);
  const hasTodayRecord = today.foodCalories > 0 || today.exerciseCalories > 0;
  const foodCaloriesToAdd = Number(foodAmount);
  const exerciseCaloriesToAdd = Number(exerciseAmount);
  const riceCalories = Number(riceGrams) > 0 ? round((Number(riceGrams) * 116) / 100) : 0;

  function addFood() {
    if (!foodCaloriesToAdd || foodCaloriesToAdd <= 0) return;
    onAddEntry("food", foodCaloriesToAdd, foodNote || "摄入");
    setFoodAmount("");
    setFoodNote("");
  }

  function addExercise() {
    if (!exerciseCaloriesToAdd || exerciseCaloriesToAdd <= 0) return;
    onAddEntry("exercise", exerciseCaloriesToAdd, exerciseNote || "运动");
    setExerciseAmount("");
    setExerciseNote("");
  }

  return (
    <div className="space-y-4">
      <Card className="border-rose-100 bg-rose-50/70">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-rose-600">
          <Flame size={18} />
          今天还需要做多少运动
        </div>
        {today.foodCalories === 0 && today.exerciseCalories === 0 ? (
          <>
            <p className="text-zinc-600">先记录今天的摄入或运动，</p>
            <div className="my-1 text-4xl font-black tracking-tight text-zinc-950">我会自动帮你算。</div>
            <p className="text-zinc-600">过了午夜会自动进入新的一天。</p>
          </>
        ) : remainingExercise > 0 ? (
          <>
            <p className="text-zinc-600">今天还需要消耗</p>
            <div className="my-1 text-5xl font-black tracking-tight text-zinc-950">
              {round(remainingExercise)}
              <span className="ml-2 text-2xl text-zinc-500">kcal</span>
            </div>
            <p className="text-zinc-600">才能保持计划进度。</p>
          </>
        ) : (
          <>
            <p className="text-zinc-600">你已经达到</p>
            <div className="my-1 text-4xl font-black tracking-tight text-zinc-950">今天的目标。</div>
            <p className="text-zinc-600">保持得很好。</p>
          </>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-black text-zinc-900">随手记录</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-zinc-50 p-3">
            <QuickNumberField label="这次吃了多少" suffix="kcal" value={foodAmount} onChange={setFoodAmount} />
            <input
              className="mt-3 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 outline-none focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
              placeholder="备注，比如早餐、奶茶、晚饭"
              value={foodNote}
              onChange={(event) => setFoodNote(event.target.value)}
            />
            <button
              type="button"
              disabled={!foodCaloriesToAdd || foodCaloriesToAdd <= 0}
              onClick={addFood}
              className="mt-3 w-full rounded-lg bg-rose-500 px-3 py-2 text-sm font-bold text-white shadow-sm active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
            >
              添加摄入
            </button>
            <div className="mt-3 rounded-lg border border-rose-100 bg-white p-3">
              <p className="text-sm font-bold text-zinc-800">米饭估算</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">按熟白米饭约 116 kcal / 100g 估算。</p>
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                <QuickNumberField label="熟米饭重量" suffix="g" value={riceGrams} onChange={setRiceGrams} />
                <div className="self-end rounded-lg bg-rose-50 px-3 py-2 text-right text-rose-700">
                  <p className="text-xs font-bold">约</p>
                  <p className="text-lg font-black">{riceCalories} kcal</p>
                </div>
              </div>
              <button
                className="mt-2 w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 disabled:cursor-not-allowed disabled:border-zinc-100 disabled:bg-zinc-100 disabled:text-zinc-400"
                type="button"
                disabled={!riceCalories}
                onClick={() => {
                  setFoodAmount(String(riceCalories));
                  setFoodNote(`${riceGrams}g 熟米饭`);
                }}
              >
                用这个热量填入摄入
              </button>
            </div>
          </div>
          <div className="rounded-lg bg-zinc-50 p-3">
            <QuickNumberField label="这次运动消耗" suffix="kcal" value={exerciseAmount} onChange={setExerciseAmount} />
            <input
              className="mt-3 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 outline-none focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
              placeholder="备注，比如跑步、椭圆机、游泳"
              value={exerciseNote}
              onChange={(event) => setExerciseNote(event.target.value)}
            />
            <button
              type="button"
              disabled={!exerciseCaloriesToAdd || exerciseCaloriesToAdd <= 0}
              onClick={addExercise}
              className="mt-3 w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-bold text-white shadow-sm active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
            >
              添加运动
            </button>
          </div>
        </div>
        {today.foodCalories > 0 && today.foodCalories < plan.minimumCalories ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            你的热量摄入低于最低目标。
          </div>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat icon={<Activity size={15} />} label="今日摄入" value={`${round(today.foodCalories)} kcal`} />
          <Stat icon={<Flame size={15} />} label="今日运动" value={`${round(today.exerciseCalories)} kcal`} />
        </div>
      </Card>

      <Card className={weighInDue ? "border-amber-200 bg-amber-50/70" : ""}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-zinc-900">体重记录</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              不需要每天称。建议每 7 天记录一次，下一次建议称重：{nextWeighDate}。
            </p>
          </div>
          {weighInDue ? <span className="rounded-full bg-amber-200 px-2 py-1 text-xs font-bold text-amber-900">今天该称重</span> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <NumberField label="本次体重" suffix="kg" value={weightInput} onChange={setWeightInput} />
          <button
            className="self-end rounded-lg bg-zinc-900 px-4 py-3 text-sm font-bold text-white shadow-sm active:scale-[0.99]"
            type="button"
            onClick={() => onRecordWeight(weightInput)}
          >
            记录体重
          </button>
        </div>
        <button
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-bold text-zinc-700"
          type="button"
          onClick={() => setShowReview((value) => !value)}
        >
          <Copy size={16} />
          生成复盘报告 / 问 AI 怎么调整
        </button>
        {showReview ? (
          <div className="mt-3 rounded-lg bg-white p-3">
            <p className="mb-2 text-sm font-bold text-zinc-800">可以这样问 AI：</p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-xs leading-5 text-zinc-700">
              {createReviewPrompt(plan, logs)}
            </pre>
            <button
              className="mt-3 w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-bold text-white"
              type="button"
              onClick={onCopyReviewPrompt}
            >
              复制这段内容
            </button>
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Stat icon={<Target size={15} />} label="所需运动消耗" value={hasTodayRecord ? `${round(requiredExercise)} kcal` : "待记录"} />
        <Stat icon={<Activity size={15} />} label="今日实际缺口" value={hasTodayRecord ? `${round(actualDeficit)} kcal` : "待记录"} tone="rose" />
        <Stat
          icon={<Scale size={15} />}
          label="预计脂肪减少"
          value={hasTodayRecord ? `${round(estimatedFatLoss, 2)} kg` : "待记录"}
          tone="emerald"
        />
        <Stat
          icon={<HeartPulse size={15} />}
          label="目标热量缺口"
          value={`${round(plan.targetDeficit)} kcal`}
        />
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-black text-zinc-900">今天明细</h2>
        {todayEntries.length ? (
          <div className="space-y-2">
            {todayEntries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2">
                <div>
                  <p className="text-sm font-bold text-zinc-800">{entry.note}</p>
                  <p className="text-xs text-zinc-400">{entry.type === "food" ? "摄入" : "运动"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className={`text-lg font-black ${entry.type === "food" ? "text-rose-600" : "text-emerald-600"}`}>
                    {entry.type === "food" ? "+" : "-"}
                    {round(entry.calories)} kcal
                  </p>
                  <button
                    className="rounded-full p-1 text-zinc-400 hover:bg-white hover:text-red-500"
                    type="button"
                    aria-label={`删除${entry.note}`}
                    onClick={() => onDeleteEntry(entry.id)}
                  >
                    <XCircle size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg bg-zinc-50 p-4 text-center text-sm text-zinc-500">
            今天还没有记录。吃完或运动完就加一笔。
          </p>
        )}
      </Card>
    </div>
  );
}

function ProgressScreen({ plan, logs }: { plan: Plan; logs: DailyLog[] }) {
  const sortedLogs = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  const latestWeight = sortedLogs[0]?.weight ?? plan.currentWeight;
  const measuredLoss = plan.currentWeight - latestWeight;
  const targetLoss = plan.currentWeight - plan.goalWeight;
  const estimatedFatLoss = logs.reduce((sum, log) => sum + log.actualDeficit, 0) / 7700;
  const progress = targetLoss > 0 ? clamp((estimatedFatLoss / targetLoss) * 100, 0, 100) : 0;
  const averageDeficit = logs.length
    ? logs.reduce((sum, log) => sum + log.actualDeficit, 0) / logs.length
    : 0;
  const recent = [...logs].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  const weeklyChange = recent.length >= 2 ? recent[recent.length - 1].weight - recent[0].weight : 0;
  const remainingWeight = Math.max(0, latestWeight - plan.goalWeight);
  const streak = getStreak(logs);

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-zinc-900">进度</h2>
            <p className="text-sm text-zinc-500">按累计热量缺口估算，已完成目标的 {round(progress)}%</p>
          </div>
          <div className="rounded-lg bg-rose-50 p-2 text-rose-500">
            <ChartNoAxesColumnIncreasing size={22} />
          </div>
        </div>
        <div className="h-4 overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full rounded-full bg-rose-400" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-3 flex justify-between text-sm font-semibold text-zinc-500">
          <span>预计减少 {round(estimatedFatLoss, 2)} kg</span>
          <span>目标减少 {round(targetLoss, 1)} kg</span>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Stat icon={<Activity size={15} />} label="平均每日缺口" value={`${round(averageDeficit)} kcal`} />
        <Stat icon={<Scale size={15} />} label="近 7 天变化" value={`${round(weeklyChange, 2)} kg`} />
        <Stat icon={<Target size={15} />} label="距离目标" value={`${round(remainingWeight, 1)} kg`} tone="rose" />
        <Stat icon={<Sparkles size={15} />} label="连续记录" value={`${streak} 天`} tone="emerald" />
        <Stat icon={<Scale size={15} />} label="最近体重" value={`${round(latestWeight, 1)} kg`} />
        <Stat icon={<ChartNoAxesColumnIncreasing size={15} />} label="称重变化" value={`${round(measuredLoss, 2)} kg`} />
      </div>

      <Card>
        <h3 className="mb-3 text-lg font-black text-zinc-900">每日记录</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="py-2">日期</th>
                <th>体重</th>
                <th>摄入</th>
                <th>运动</th>
                <th>缺口</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {sortedLogs.length ? (
                sortedLogs.map((log) => (
                  <tr key={log.date} className="font-medium text-zinc-700">
                    <td className="py-3">{log.date}</td>
                    <td>{round(log.weight, 1)} kg</td>
                    <td>{round(log.foodCalories)} kcal</td>
                    <td>{round(log.exerciseCalories)} kcal</td>
                    <td>{round(log.actualDeficit)} kcal</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-6 text-center text-zinc-400" colSpan={5}>
                    还没有记录。保存今天记录后会显示在这里。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function getStreak(logs: DailyLog[]) {
  const dates = new Set(logs.map((log) => log.date));
  let streak = 0;
  const cursor = new Date();

  while (dates.has(localDateString(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function daysBetweenInclusive(startDate: string, endDate: string) {
  const start = parseLocalDate(startDate).getTime();
  const end = parseLocalDate(endDate).getTime();
  return Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function emptyAttachments(): PlanAttachments {
  return {
    reports: {},
    photos: {
      before: {},
      after: {},
    },
  };
}

function normalizeAttachments(attachments?: PlanAttachments): PlanAttachments {
  return {
    ...emptyAttachments(),
    ...attachments,
    reports: {
      ...emptyAttachments().reports,
      ...attachments?.reports,
    },
    photos: {
      before: {
        ...attachments?.photos?.before,
      },
      after: {
        ...attachments?.photos?.after,
      },
    },
  };
}

function ensureAttachments(history: PlanHistory): PlanAttachments {
  return normalizeAttachments(history.attachments);
}

function readFileAsStoredFile(file: File): Promise<StoredFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        type: file.type,
        dataUrl: String(reader.result),
        uploadedAt: localDateString(),
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function hasBaselinePhoto(plan: Plan) {
  const before = normalizeAttachments(plan.attachments).photos.before;
  return Boolean(before.front || before.side || before.back);
}

function createPlanHistory(plan: Plan, logs: DailyLog[], status: PlanStatus): PlanHistory {
  const sortedLogs = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const endWeight = sortedLogs[sortedLogs.length - 1]?.weight ?? plan.currentWeight;
  const totalWeightChange = plan.currentWeight - endWeight;
  const targetLoss = plan.currentWeight - plan.goalWeight;
  const goalProgressPercentage = targetLoss > 0 ? clamp((totalWeightChange / targetLoss) * 100, 0, 100) : 0;
  const daysRecorded = sortedLogs.length;
  const planDays = daysBetweenInclusive(plan.startDate, plan.endDate);

  const summary =
    status === "Stopped Early"
      ? `这个计划已提前终止。你记录了 ${daysRecorded} / ${planDays} 天。`
      : `这个计划中，你在 ${planDays} 天内变化了 ${round(totalWeightChange, 1)} kg，并完成了 ${daysRecorded} 天记录。`;

  return {
    id: `${Date.now()}`,
    planName: plan.name,
    startDate: plan.startDate,
    endDate: plan.endDate,
    startWeight: plan.currentWeight,
    endWeight,
    goalWeight: plan.goalWeight,
    totalWeightChange,
    goalProgressPercentage,
    averageDailyCalorieIntake: average(sortedLogs.map((log) => log.foodCalories)),
    averageDailyExerciseCalories: average(sortedLogs.map((log) => log.exerciseCalories)),
    averageDailyCalorieDeficit: average(sortedLogs.map((log) => log.actualDeficit)),
    daysRecorded,
    goalMetDays: sortedLogs.filter((log) => log.actualDeficit >= plan.targetDeficit).length,
    status,
    summary,
    logs: sortedLogs,
    archivedAt: localDateString(),
    attachments: normalizeAttachments(plan.attachments),
  };
}

function statusLabel(status: PlanStatus) {
  if (status === "Completed") return "已完成";
  if (status === "Stopped Early") return "提前终止";
  return "已归档";
}

function HistoryScreen({
  history,
  selectedHistory,
  setSelectedHistory,
  onDeleteHistory,
  onUpdateHistory,
}: {
  history: PlanHistory[];
  selectedHistory: PlanHistory | null;
  setSelectedHistory: (history: PlanHistory | null) => void;
  onDeleteHistory: (id: string) => void;
  onUpdateHistory: (history: PlanHistory) => void;
}) {
  if (selectedHistory) {
    return (
      <div className="space-y-4">
        <button
          className="flex items-center gap-2 text-sm font-bold text-zinc-600"
          type="button"
          onClick={() => setSelectedHistory(null)}
        >
          <ChevronLeft size={18} />
          返回计划日志
        </button>
        <HistoryCard history={selectedHistory} expanded onDelete={() => onDeleteHistory(selectedHistory.id)} />
        <HistoryAttachments history={selectedHistory} onUpdate={onUpdateHistory} />
        <Card>
          <h3 className="mb-3 text-lg font-black text-zinc-900">每日记录</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="py-2">日期</th>
                  <th>体重</th>
                  <th>摄入</th>
                  <th>运动</th>
                  <th>缺口</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {selectedHistory.logs.length ? (
                  selectedHistory.logs.map((log) => (
                    <tr key={log.date} className="font-medium text-zinc-700">
                      <td className="py-3">{log.date}</td>
                      <td>{round(log.weight, 1)} kg</td>
                      <td>{round(log.foodCalories)} kcal</td>
                      <td>{round(log.exerciseCalories)} kcal</td>
                      <td>{round(log.actualDeficit)} kcal</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-6 text-center text-zinc-400" colSpan={5}>
                      这个计划没有每日记录。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-rose-50 p-2 text-rose-500">
            <Archive size={22} />
          </div>
          <div>
            <h2 className="text-xl font-black text-zinc-900">计划日志</h2>
            <p className="text-sm text-zinc-500">已完成或提前终止的计划会保存在这里。</p>
          </div>
        </div>
      </Card>
      {history.length ? (
        history.map((item) => (
          <HistoryCard
            key={item.id}
            history={item}
            onOpen={() => setSelectedHistory(item)}
            onDelete={() => onDeleteHistory(item.id)}
          />
        ))
      ) : (
        <Card>
          <p className="text-center text-sm text-zinc-500">还没有历史计划。终止或完成一个计划后，会出现在这里。</p>
        </Card>
      )}
    </div>
  );
}

function HistoryCard({
  history,
  expanded = false,
  onOpen,
  onDelete,
}: {
  history: PlanHistory;
  expanded?: boolean;
  onOpen?: () => void;
  onDelete?: () => void;
}) {
  return (
    <Card className={expanded ? "border-rose-100" : ""}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-rose-500">{statusLabel(history.status)}</p>
          <h3 className="mt-1 text-lg font-black text-zinc-950">{history.planName}</h3>
          <p className="mt-1 text-sm leading-6 text-zinc-500">{history.summary}</p>
        </div>
        {!expanded ? <ChevronLeft className="mt-1 rotate-180 text-zinc-300" size={18} /> : null}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <MiniMetric label="开始日期" value={history.startDate} />
        <MiniMetric label="结束日期" value={history.endDate} />
        <MiniMetric label="起始体重" value={`${round(history.startWeight, 1)} kg`} />
        <MiniMetric label="结束体重" value={`${round(history.endWeight, 1)} kg`} />
        <MiniMetric label="目标体重" value={`${round(history.goalWeight, 1)} kg`} />
        <MiniMetric label="总变化" value={`${round(history.totalWeightChange, 1)} kg`} />
        <MiniMetric label="目标进度" value={`${round(history.goalProgressPercentage)}%`} />
        <MiniMetric label="平均摄入" value={`${round(history.averageDailyCalorieIntake)} kcal`} />
        <MiniMetric label="平均运动" value={`${round(history.averageDailyExerciseCalories)} kcal`} />
        <MiniMetric label="平均缺口" value={`${round(history.averageDailyCalorieDeficit)} kcal`} />
        <MiniMetric label="记录天数" value={`${history.daysRecorded} 天`} />
        <MiniMetric label="达标天数" value={`${history.goalMetDays} 天`} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {!expanded && onOpen ? (
          <button
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-bold text-white"
            type="button"
            onClick={onOpen}
          >
            查看详情
          </button>
        ) : null}
        {onDelete ? (
          <button
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-600"
            type="button"
            onClick={onDelete}
          >
            删除这条日志
          </button>
        ) : null}
      </div>
    </Card>
  );
}

function HistoryAttachments({
  history,
  onUpdate,
}: {
  history: PlanHistory;
  onUpdate: (history: PlanHistory) => void;
}) {
  const attachments = ensureAttachments(history);

  async function uploadReport(phase: "before" | "after", fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    const stored = await readFileAsStoredFile(file);
    onUpdate({
      ...history,
      attachments: {
        ...attachments,
        reports: {
          ...attachments.reports,
          [phase]: stored,
        },
      },
    });
  }

  async function uploadPhoto(phase: "before" | "after", slot: BodyPhotoSlot, fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    const stored = await readFileAsStoredFile(file);
    onUpdate({
      ...history,
      attachments: {
        ...attachments,
        photos: {
          ...attachments.photos,
          [phase]: {
            ...attachments.photos[phase],
            [slot]: stored,
          },
        },
      },
    });
  }

  return (
    <Card>
      <div className="mb-4">
        <h3 className="text-lg font-black text-zinc-900">附件和对比</h3>
        <p className="mt-1 text-sm leading-6 text-zinc-500">
          可选上传。文件只保存在当前浏览器本地，适合少量报告和照片。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ReportUpload
          file={attachments.reports.before}
          label="计划开始前体检报告"
          onChange={(files) => uploadReport("before", files)}
        />
        <ReportUpload
          file={attachments.reports.after}
          label="计划结束后体检报告"
          onChange={(files) => uploadReport("after", files)}
        />
      </div>

      <div className="mt-5 space-y-3">
        <h4 className="text-base font-black text-zinc-900">身体照片对比</h4>
        {(["front", "side", "back"] as BodyPhotoSlot[]).map((slot) => (
          <PhotoCompare
            key={slot}
            slot={slot}
            before={attachments.photos.before[slot]}
            after={attachments.photos.after[slot]}
            onBefore={(files) => uploadPhoto("before", slot, files)}
            onAfter={(files) => uploadPhoto("after", slot, files)}
          />
        ))}
      </div>
    </Card>
  );
}

function ReportUpload({
  label,
  file,
  onChange,
}: {
  label: string;
  file?: StoredFile;
  onChange: (files: FileList | null) => void;
}) {
  return (
    <div className="rounded-lg bg-zinc-50 p-3">
      <p className="text-sm font-bold text-zinc-800">{label}</p>
      {file ? (
        <a
          className="mt-2 block truncate rounded-lg bg-white px-3 py-2 text-sm font-semibold text-rose-600"
          href={file.dataUrl}
          download={file.name}
        >
          {file.name}
        </a>
      ) : (
        <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm text-zinc-400">还没上传</p>
      )}
      <input
        className="mt-3 block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
        type="file"
        accept="image/*,.pdf"
        onChange={(event) => onChange(event.target.files)}
      />
    </div>
  );
}

function PhotoCompare({
  slot,
  before,
  after,
  onBefore,
  onAfter,
}: {
  slot: BodyPhotoSlot;
  before?: StoredFile;
  after?: StoredFile;
  onBefore: (files: FileList | null) => void;
  onAfter: (files: FileList | null) => void;
}) {
  const labels: Record<BodyPhotoSlot, string> = {
    front: "正面",
    side: "侧面",
    back: "背面",
  };

  return (
    <div className="rounded-lg border border-zinc-100 p-3">
      <p className="mb-3 text-sm font-black text-zinc-900">{labels[slot]}</p>
      <div className="grid grid-cols-2 gap-3">
        <PhotoSlot label="计划前" file={before} onChange={onBefore} />
        <PhotoSlot label="计划后" file={after} onChange={onAfter} />
      </div>
    </div>
  );
}

function PhotoSlot({
  label,
  file,
  onChange,
}: {
  label: string;
  file?: StoredFile;
  onChange: (files: FileList | null) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold text-zinc-500">{label}</p>
      {file && file.type.startsWith("image/") ? (
        <img className="aspect-[3/4] w-full rounded-lg object-cover" src={file.dataUrl} alt={`${label}照片`} />
      ) : (
        <div className="flex aspect-[3/4] items-center justify-center rounded-lg bg-zinc-50 text-xs text-zinc-400">
          未上传
        </div>
      )}
      <input
        className="mt-2 block w-full text-xs text-zinc-600 file:mr-2 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-2 file:py-1.5 file:text-xs file:font-bold file:text-zinc-700"
        type="file"
        accept="image/*"
        onChange={(event) => onChange(event.target.files)}
      />
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 p-3">
      <p className="text-xs font-medium text-zinc-400">{label}</p>
      <p className="mt-1 font-black text-zinc-900">{value}</p>
    </div>
  );
}

function ToolsScreen() {
  const [kcal, setKcal] = useState(1200);
  const [kj, setKj] = useState(round(1200 * 4.184));
  const [kg, setKg] = useState(56);
  const [lb, setLb] = useState(round(56 * 2.20462, 1));
  const [heightCm, setHeightCm] = useState(165);
  const bmi = heightCm > 0 ? kg / (heightCm / 100) ** 2 : 0;

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-lg bg-rose-50 p-2 text-rose-500">
            <Calculator size={22} />
          </div>
          <div>
            <h2 className="text-xl font-black text-zinc-900">实用工具</h2>
            <p className="text-sm text-zinc-500">一些快速手动计算工具。</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="千卡"
            suffix="kcal"
            value={kcal}
            onChange={(value) => {
              setKcal(value);
              setKj(round(value * 4.184));
            }}
          />
          <NumberField
            label="千焦"
            suffix="kJ"
            value={kj}
            onChange={(value) => {
              setKj(value);
              setKcal(round(value / 4.184));
            }}
          />
          <NumberField
            label="千克"
            suffix="kg"
            value={kg}
            onChange={(value) => {
              setKg(value);
              setLb(round(value * 2.20462, 1));
            }}
          />
          <NumberField
            label="磅"
            suffix="lb"
            value={lb}
            onChange={(value) => {
              setLb(value);
              setKg(round(value / 2.20462, 1));
            }}
          />
        </div>
      </Card>

      <Card>
        <h3 className="mb-4 text-lg font-black text-zinc-900">BMI 快算</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="体重"
            suffix="kg"
            value={kg}
            onChange={(value) => {
              setKg(value);
              setLb(round(value * 2.20462, 1));
            }}
          />
          <NumberField label="身高" suffix="cm" value={heightCm} onChange={setHeightCm} />
        </div>
        <div className="mt-4 rounded-lg bg-zinc-50 p-3">
          <p className="text-sm font-semibold text-zinc-500">BMI</p>
          <p className="mt-1 text-3xl font-black text-zinc-900">{round(bmi, 1)}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">只是快速参考，不替代体检或医生建议。</p>
        </div>
      </Card>
    </div>
  );
}

const appStorageKeys = [planKey, todayKey, logsKey, entriesKey, activePlanKey, planHistoryKey];

type AppBackup = {
  app: string;
  version: number;
  exportedAt: string;
  localStorage: Record<string, string>;
};

function SettingsScreen({ onToast }: { onToast: (message: string) => void }) {
  async function exportData() {
    const backup: AppBackup = {
      app: "今日运动计划",
      version: 1,
      exportedAt: new Date().toISOString(),
      localStorage: Object.fromEntries(
        appStorageKeys.map((key) => [key, localStorage.getItem(key)]).filter(([, value]) => value !== null) as Array<
          [string, string]
        >,
      ),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `今日运动计划-backup-${localDateString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    onToast("数据已导出");
  }

  async function importData(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const backup = JSON.parse(text) as Partial<AppBackup>;
      const valid =
        backup.app === "今日运动计划" &&
        backup.version === 1 &&
        backup.localStorage &&
        typeof backup.localStorage === "object";

      if (!valid) {
        onToast("这不是有效的备份文件");
        return;
      }

      const confirmed = window.confirm("导入会覆盖当前设备上的所有 app 数据，确定继续吗？");
      if (!confirmed) return;

      appStorageKeys.forEach((key) => localStorage.removeItem(key));
      Object.entries(backup.localStorage ?? {}).forEach(([key, value]) => {
        if (appStorageKeys.includes(key) && typeof value === "string") {
          localStorage.setItem(key, value);
        }
      });
      window.alert("导入成功，页面将刷新。");
      window.location.reload();
    } catch {
      onToast("导入失败，请检查 JSON 文件");
    }
  }

  function resetApp() {
    const confirmed = window.confirm("这会清空所有计划、记录、日志和附件。确定重置吗？");
    if (!confirmed) return;
    appStorageKeys.forEach((key) => localStorage.removeItem(key));
    window.alert("已清空数据，页面将刷新。");
    window.location.reload();
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-lg bg-rose-50 p-2 text-rose-500">
            <Settings size={22} />
          </div>
          <div>
            <h2 className="text-xl font-black text-zinc-900">设置</h2>
            <p className="text-sm leading-6 text-zinc-500">导出、导入或清空本地数据。数据只保存在这个浏览器里。</p>
          </div>
        </div>
        <div className="space-y-3">
          <button
            className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-bold text-white shadow-sm active:scale-[0.99]"
            type="button"
            onClick={exportData}
          >
            导出数据
          </button>
          <label className="block rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <span className="mb-2 block text-sm font-bold text-zinc-800">导入数据</span>
            <input
              className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-bold file:text-zinc-700"
              type="file"
              accept="application/json,.json"
              onChange={(event) => importData(event.target.files)}
            />
            <span className="mt-2 block text-xs leading-5 text-zinc-500">导入前会要求确认，确认后会覆盖当前数据。</span>
          </label>
          <button
            className="w-full rounded-lg border border-red-200 bg-white px-4 py-3 text-sm font-bold text-red-600 shadow-sm active:scale-[0.99]"
            type="button"
            onClick={resetApp}
          >
            重置 App
          </button>
        </div>
      </Card>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [plan, setPlan] = useState<Plan>(() => normalizePlan(readLocal(planKey, defaults)));
  const [today, setToday] = useState<Today>(() => readLocal(todayKey, todayDefaults));
  const [logs, setLogs] = useState<DailyLog[]>(() => readLocal(logsKey, []));
  const [entries, setEntries] = useState<DailyEntry[]>(() => readLocal(entriesKey, []));
  const [history, setHistory] = useState<PlanHistory[]>(() => readLocal(planHistoryKey, []));
  const [hasActivePlan, setHasActivePlan] = useState<boolean>(() =>
    readLocal(activePlanKey, Boolean(localStorage.getItem(planKey))),
  );
  const [selectedHistory, setSelectedHistory] = useState<PlanHistory | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    document.title = "今日运动计划";
  }, []);

  useEffect(() => {
    localStorage.setItem(todayKey, JSON.stringify(today));
  }, [today]);

  useEffect(() => {
    localStorage.setItem(entriesKey, JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const goalSummary = useMemo(() => {
    const start = parseLocalDate(localDateString()).getTime();
    const end = parseLocalDate(plan.endDate).getTime();
    const daysLeft = Math.max(0, Math.round((end - start) / (24 * 60 * 60 * 1000)));
    return `${round(plan.currentWeight - plan.goalWeight, 1)} kg，剩余 ${daysLeft} 天`;
  }, [plan.currentWeight, plan.endDate, plan.goalWeight]);

  const displayedToday = useMemo(() => {
    const date = localDateString();
    const totals = totalsFromEntries(getEntriesForDate(entries, date));
    const existingLog = logs.find((log) => log.date === date);
    return {
      foodCalories: totals.foodCalories,
      exerciseCalories: totals.exerciseCalories,
      weight: existingLog?.weight ?? today.weight,
    };
  }, [entries, logs, today.weight]);

  function savePlan() {
    const normalized = normalizePlan({ ...plan, name: createPlanName(plan.startDate) });
    if (!hasActivePlan) {
      const missing: string[] = [];
      if (!normalized.startDate) missing.push("开始日期");
      if (!normalized.endDate) missing.push("结束日期");
      if (parseLocalDate(normalized.endDate).getTime() <= parseLocalDate(normalized.startDate).getTime()) {
        missing.push("结束日期需晚于开始日期");
      }
      if (normalized.currentWeight <= 0) missing.push("当前体重");
      if (normalized.goalWeight <= 0) missing.push("目标体重");
      if (normalized.bmr <= 0) missing.push("基础代谢");
      if (!normalized.activityLevel) missing.push("日常活动");
      if (normalized.targetDeficit <= 0) missing.push("每日目标热量缺口");
      if (normalized.minimumCalories <= 0) missing.push("每日最低摄入");
      if (!hasBaselinePhoto(normalized)) missing.push("至少一张计划前身体照片");

      if (missing.length) {
        setToast(`请补全：${missing.join("、")}`);
        return;
      }
    }
    setPlan(normalized);
    localStorage.setItem(planKey, JSON.stringify(normalized));
    localStorage.setItem(activePlanKey, JSON.stringify(true));
    setHasActivePlan(true);
    setToast("计划已保存");
    setTab("today");
  }

  function updatePlan(nextPlan: Plan) {
    const normalized = normalizePlan(nextPlan);
    setPlan(normalized);
    if (hasActivePlan) {
      localStorage.setItem(planKey, JSON.stringify(normalized));
    }
  }

  function archiveCurrentPlan(status: PlanStatus) {
    const archived = createPlanHistory(plan, logs, status);
    const nextHistory = [archived, ...history];
    const freshPlan = normalizePlan({
      ...defaults,
      startDate: localDateString(),
      endDate: localDateString(defaultGoalDate),
      name: createPlanName(localDateString()),
    });

    setHistory(nextHistory);
    setLogs([]);
    setEntries([]);
    setPlan(freshPlan);
    setHasActivePlan(false);
    setSelectedHistory(archived);
    localStorage.setItem(planHistoryKey, JSON.stringify(nextHistory));
    localStorage.setItem(logsKey, JSON.stringify([]));
    localStorage.setItem(entriesKey, JSON.stringify([]));
    localStorage.setItem(planKey, JSON.stringify(freshPlan));
    localStorage.setItem(activePlanKey, JSON.stringify(false));
    setToast("当前计划已保存到日志");
    setTab("history");
  }

  function deleteHistoryItem(id: string) {
    const nextHistory = history.filter((item) => item.id !== id);
    setHistory(nextHistory);
    if (selectedHistory?.id === id) setSelectedHistory(null);
    localStorage.setItem(planHistoryKey, JSON.stringify(nextHistory));
    setToast("日志已删除");
  }

  function updateHistoryItem(updated: PlanHistory) {
    const nextHistory = history.map((item) => (item.id === updated.id ? updated : item));
    setHistory(nextHistory);
    setSelectedHistory(updated);
    localStorage.setItem(planHistoryKey, JSON.stringify(nextHistory));
    setToast("附件已保存");
  }

  function updateTodayLog(nextEntries: DailyEntry[], weight = today.weight) {
    const date = localDateString();
    const totals = totalsFromEntries(getEntriesForDate(nextEntries, date));
    const todayTotals: Today = {
      foodCalories: totals.foodCalories,
      exerciseCalories: totals.exerciseCalories,
      weight,
    };
    const nextLogs = upsertDailyLog(plan, logs, date, todayTotals);
    setToday(todayTotals);
    setLogs(nextLogs);
    localStorage.setItem(logsKey, JSON.stringify(nextLogs));
    localStorage.setItem(todayKey, JSON.stringify(todayTotals));
  }

  function addEntry(type: "food" | "exercise", calories: number, note: string) {
    const entry: DailyEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      date: localDateString(),
      type,
      calories,
      note,
      createdAt: new Date().toISOString(),
    };
    const nextEntries = [entry, ...entries];
    setEntries(nextEntries);
    localStorage.setItem(entriesKey, JSON.stringify(nextEntries));
    updateTodayLog(nextEntries);
    setToast(type === "food" ? "摄入已添加" : "运动已添加");
  }

  function deleteEntry(id: string) {
    const nextEntries = entries.filter((entry) => entry.id !== id);
    setEntries(nextEntries);
    localStorage.setItem(entriesKey, JSON.stringify(nextEntries));
    updateTodayLog(nextEntries);
    setToast("记录已删除");
  }

  function recordWeight(weight: number) {
    updateTodayLog(entries, weight);
    setToast("体重已记录");
  }

  async function copyReviewPrompt() {
    const prompt = createReviewPrompt(plan, logs);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(prompt);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = prompt;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setToast("复盘提示词已复制");
    } catch {
      setToast("复制失败，请手动选择提示词");
    }
  }

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "setup", label: "计划", icon: <Settings size={18} /> },
    { id: "today", label: "今日", icon: <Home size={18} /> },
    { id: "tools", label: "工具", icon: <Calculator size={18} /> },
    { id: "progress", label: "进度", icon: <ChartNoAxesColumnIncreasing size={18} /> },
    { id: "history", label: "日志", icon: <Archive size={18} /> },
    { id: "settings", label: "设置", icon: <Settings size={18} /> },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 pb-28 pt-5 sm:px-6 sm:pb-8">
      <header className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-rose-500">今日运动计划</p>
          <h1 className="text-2xl font-black tracking-tight text-zinc-950">今天还需要动多少？</h1>
          <p className="mt-1 text-sm text-zinc-500">{goalSummary}</p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-500">
          <Flame size={25} />
        </div>
      </header>

      {tab === "setup" ? (
        <SetupScreen
          plan={plan}
          setPlan={updatePlan}
          onSave={savePlan}
          hasActivePlan={hasActivePlan}
          onArchivePlan={archiveCurrentPlan}
        />
      ) : null}
      {tab === "today" ? (
        <TodayScreen
          plan={plan}
          today={displayedToday}
          entries={entries}
          logs={logs}
          onAddEntry={addEntry}
          onDeleteEntry={deleteEntry}
          onRecordWeight={recordWeight}
          onCopyReviewPrompt={copyReviewPrompt}
        />
      ) : null}
      {tab === "progress" ? <ProgressScreen plan={plan} logs={logs} /> : null}
      {tab === "history" ? (
        <HistoryScreen
          history={history}
          selectedHistory={selectedHistory}
          setSelectedHistory={setSelectedHistory}
          onDeleteHistory={deleteHistoryItem}
          onUpdateHistory={updateHistoryItem}
        />
      ) : null}
      {tab === "tools" ? <ToolsScreen /> : null}
      {tab === "settings" ? <SettingsScreen onToast={setToast} /> : null}

      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white shadow-lg sm:bottom-6">
          {toast}
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/95 px-3 py-2 backdrop-blur sm:sticky sm:bottom-auto sm:mt-6 sm:rounded-lg sm:border">
        <div className="mx-auto grid max-w-3xl grid-cols-6 gap-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-bold transition ${
                tab === item.id ? "bg-rose-50 text-rose-600" : "text-zinc-500"
              }`}
              onClick={() => setTab(item.id)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
