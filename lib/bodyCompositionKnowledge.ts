import type { BodyMetricKey } from "@/types/body";

/**
 * Curated, reviewed knowledge about smart-scale (bioelectrical impedance) parameters.
 * Deterministic on purpose: no runtime LLM calls, so output is testable and free.
 *
 * Range confidence:
 *  - "guideline"       published clinical/public-health cut-off
 *  - "reference-table" research-based population table (varies a little by source)
 *  - "vendor-specific" scale-brand convention; compare only against the same scale
 *  - none              no reliable range exists, the value is shown but not graded
 */
export type RangeConfidence = "guideline" | "reference-table" | "vendor-specific";

export interface ReferenceRange {
  sex: "male" | "female" | "any";
  minAge: number;
  maxAge: number;
  low: number | null;
  high: number | null;
  source: string;
  confidence: RangeConfidence;
}

export type BodyMetricGroup = "Weight & BMI" | "Fat" | "Muscle & Protein" | "Water & Bone" | "Metabolic";

export interface BodyMetricKnowledge {
  key: BodyMetricKey;
  label: string;
  unit: string;
  group: BodyMetricGroup;
  decimals: number;
  /** Plain-language definition. */
  what: string;
  /** Why the number matters for health. */
  why: string;
  /** Which direction is generally favourable, or null when "stable" / context-dependent. */
  goodDirection: "down" | "up" | null;
  trendMeaning: string;
  actions: string;
  ranges: ReferenceRange[];
}

const ANY_AGE = { minAge: 18, maxAge: 120 };

export const BODY_METRICS: BodyMetricKnowledge[] = [
  {
    key: "weightKg",
    label: "Weight",
    unit: "kg",
    group: "Weight & BMI",
    decimals: 2,
    what: "Total body mass: fat, muscle, bone, organs and water together.",
    why: "A basic load measure for joints, heart and metabolism, but it cannot say what the mass is made of. Daily swings of 1–2.5 kg from water and food are normal.",
    goodDirection: null,
    trendMeaning: "Judge the weekly trend, not single readings. Weight flat while fat falls and muscle rises is a recomposition win.",
    actions: "Weigh at the same time under the same conditions (morning, after the bathroom, before eating). Read it together with fat and muscle.",
    ranges: [],
  },
  {
    key: "bmi",
    label: "BMI",
    unit: "",
    group: "Weight & BMI",
    decimals: 1,
    what: "Weight divided by height squared. A screening index that ignores body composition.",
    why: "Population-level risk indicator. It overstates risk in muscular people and understates it in people with low muscle and high fat.",
    goodDirection: "down",
    trendMeaning: "Moves almost one-to-one with weight, so it adds little beyond the weight trend.",
    actions: "Use it as a coarse screen, then check fat % and visceral fat to see whether the weight is fat or lean tissue.",
    ranges: [
      { sex: "any", ...ANY_AGE, low: 18.5, high: 24.9, source: "WHO adult BMI classification", confidence: "guideline" },
    ],
  },
  {
    key: "fatPct",
    label: "Body fat",
    unit: "%",
    group: "Fat",
    decimals: 1,
    what: "Estimated share of body weight that is fat, derived from electrical impedance.",
    why: "Excess fat, especially with low muscle, is linked to insulin resistance, blood pressure and cardiovascular risk. More informative than BMI.",
    goodDirection: "down",
    trendMeaning: "Falling fat % with stable or rising muscle is the target. Changes under about 0.5 points between readings are within scale noise.",
    actions: "Resistance training 2–3×/week, a modest calorie deficit if fat loss is the goal, adequate protein, and consistent weigh-in conditions.",
    ranges: [
      { sex: "male", minAge: 40, maxAge: 59, low: 11, high: 22, source: "Gallagher et al. 2000 (AJCN) / Harvard Health summary, ranges vary 21–23 % by source", confidence: "reference-table" },
      { sex: "male", minAge: 20, maxAge: 39, low: 8, high: 20, source: "Gallagher et al. 2000 (AJCN) / Harvard Health summary", confidence: "reference-table" },
      { sex: "female", minAge: 40, maxAge: 59, low: 23, high: 33, source: "Gallagher et al. 2000 (AJCN) / Harvard Health summary", confidence: "reference-table" },
      { sex: "female", minAge: 20, maxAge: 39, low: 21, high: 32, source: "Gallagher et al. 2000 (AJCN) / Harvard Health summary", confidence: "reference-table" },
    ],
  },
  {
    key: "fatKg",
    label: "Body fat mass",
    unit: "kg",
    group: "Fat",
    decimals: 1,
    what: "Fat weight in kilograms (weight × fat %).",
    why: "Shows the absolute amount of fat you would need to lose or hold. Easier to track than a percentage when weight changes.",
    goodDirection: "down",
    trendMeaning: "A change in fat kg is the clearest read on real fat gain or loss.",
    actions: "Track alongside lean mass so fat loss is not accompanied by muscle loss.",
    ranges: [],
  },
  {
    key: "visceralFat",
    label: "Visceral fat",
    unit: "",
    group: "Fat",
    decimals: 0,
    what: "A scale-specific index of fat stored around the abdominal organs.",
    why: "Visceral fat is the most metabolically harmful fat: it is tied to type 2 diabetes, fatty liver and heart disease. It is the most important flag in this report.",
    goodDirection: "down",
    trendMeaning: "It moves slowly. A one-point change is within noise; a sustained drop over months is meaningful.",
    actions: "Regular aerobic activity, resistance training, less alcohol and refined sugar, good sleep. Confirm with waist circumference (> 94 cm warrants attention for men) or a clinical check.",
    ranges: [
      { sex: "any", ...ANY_AGE, low: 1, high: 12, source: "Tanita-style convention (Renpho uses 1–9). Brand-specific, so indicative only", confidence: "vendor-specific" },
    ],
  },
  {
    key: "skeletalMusclePct",
    label: "Skeletal muscle %",
    unit: "%",
    group: "Muscle & Protein",
    decimals: 1,
    what: "Share of body weight that is skeletal muscle, the muscle you train and move with.",
    why: "Skeletal muscle drives strength, glucose uptake and resting metabolism. Mass declines about 0.5 %/year from midlife unless trained.",
    goodDirection: "up",
    trendMeaning: "Rises when you build muscle or lose fat; falls when you lose muscle. A percentage can rise purely because fat dropped.",
    actions: "Progressive resistance training, about 1.6 g/kg/day protein, enough sleep. Do not compare against sarcopenia cut-offs: those need appendicular (limb) measurements.",
    ranges: [],
  },
  {
    key: "skeletalMuscleKg",
    label: "Skeletal muscle mass",
    unit: "kg",
    group: "Muscle & Protein",
    decimals: 1,
    what: "Weight of skeletal muscle in kilograms.",
    why: "The absolute figure to protect during a diet. Losing it lowers strength and metabolic rate.",
    goodDirection: "up",
    trendMeaning: "Stable or rising while weight falls means the loss is coming from fat.",
    actions: "Keep training load progressive and protein adequate when cutting calories.",
    ranges: [],
  },
  {
    key: "musclePct",
    label: "Muscle %",
    unit: "%",
    group: "Muscle & Protein",
    decimals: 1,
    what: "All muscle (skeletal plus smooth/cardiac) as a share of body weight. In this export it equals Muscle kg ÷ Weight.",
    why: "A broader muscle figure than skeletal muscle. Definitions differ between scale brands, so external ranges may not match.",
    goodDirection: "up",
    trendMeaning: "Mirrors lean mass. Treat small moves as noise.",
    actions: "Use it as a secondary check next to skeletal muscle and lean mass.",
    ranges: [],
  },
  {
    key: "muscleKg",
    label: "Muscle mass",
    unit: "kg",
    group: "Muscle & Protein",
    decimals: 1,
    what: "Total muscle weight in kilograms.",
    why: "Includes muscle you cannot train directly, so it moves less than skeletal muscle.",
    goodDirection: "up",
    trendMeaning: "Should stay flat or rise across a fat-loss phase.",
    actions: "Prefer skeletal muscle kg for decisions.",
    ranges: [],
  },
  {
    key: "leanMassKg",
    label: "Weight without fat (lean mass)",
    unit: "kg",
    group: "Muscle & Protein",
    decimals: 1,
    what: "Everything except fat: muscle, bone, organs and water.",
    why: "The basis for metabolic-rate formulas such as Katch-McArdle, and the key figure for recomposition tracking.",
    goodDirection: "up",
    trendMeaning: "Moves with hydration, so a 1 kg swing in a week is more likely water than muscle.",
    actions: "Compare week-to-week only for morning readings.",
    ranges: [],
  },
  {
    key: "proteinPct",
    label: "Protein %",
    unit: "%",
    group: "Muscle & Protein",
    decimals: 1,
    what: "Estimated protein share of body weight (mostly muscle).",
    why: "A derived figure that tracks lean mass. It carries little independent information.",
    goodDirection: "up",
    trendMeaning: "Follows muscle %. Ignore changes under 0.5 points.",
    actions: "No action on its own, so use muscle and fat instead.",
    ranges: [
      { sex: "any", ...ANY_AGE, low: 16, high: 20, source: "Common smart-scale convention", confidence: "vendor-specific" },
    ],
  },
  {
    key: "waterPct",
    label: "Body water",
    unit: "%",
    group: "Water & Bone",
    decimals: 1,
    what: "Total body water as a share of weight. The impedance measurement itself depends on it.",
    why: "Hydration is the largest source of error in scale readings: dehydration inflates estimated fat %, overhydration deflates it. Muscular people sit higher.",
    goodDirection: null,
    trendMeaning: "Reflects hydration and fat level more than health. Lower fat generally means higher water %.",
    actions: "Measure at a consistent time, hydrate normally the day before, avoid readings after exercise, sauna or heavy meals.",
    ranges: [
      { sex: "male", ...ANY_AGE, low: 50, high: 65, source: "Common adult male reference band, varies with muscle and age", confidence: "vendor-specific" },
      { sex: "female", ...ANY_AGE, low: 45, high: 60, source: "Common adult female reference band, varies with muscle and age", confidence: "vendor-specific" },
    ],
  },
  {
    key: "waterKg",
    label: "Body water mass",
    unit: "kg",
    group: "Water & Bone",
    decimals: 1,
    what: "Total body water in kilograms.",
    why: "Useful for spotting hydration-driven changes in weight.",
    goodDirection: null,
    trendMeaning: "A jump in water kg with flat fat kg explains a weight bump without any real change.",
    actions: "Use it to explain unexpected weight swings.",
    ranges: [],
  },
  {
    key: "boneMassKg",
    label: "Bone mass",
    unit: "kg",
    group: "Water & Bone",
    decimals: 1,
    what: "Estimated mineral content of bone. The scale models it, it does not measure it.",
    why: "Bone density matters for fracture risk, but a scale cannot assess it. A DEXA scan is the proper test.",
    goodDirection: null,
    trendMeaning: "Should be flat. Movements of 0.1 kg are rounding or model noise.",
    actions: "Do not act on this number. Ask about a DEXA scan if bone health is a concern.",
    ranges: [],
  },
  {
    key: "bmr",
    label: "Metabolism (BMR)",
    unit: "kcal/day",
    group: "Metabolic",
    decimals: 0,
    what: "Estimated calories your body burns at complete rest, calculated from a formula using weight, height, age and sometimes lean mass.",
    why: "The floor of your daily energy budget. Total daily energy use is BMR plus movement, exercise and digestion.",
    goodDirection: "up",
    trendMeaning: "A formula output, so it rises and falls with weight and lean mass rather than showing a true change in metabolism.",
    actions: "Use it as a baseline for planning intake, then adjust using real weight trends. Never eat far below it for long.",
    ranges: [],
  },
  {
    key: "obesityDegreePct",
    label: "Obesity degree",
    unit: "%",
    group: "Metabolic",
    decimals: 1,
    what: "Percent by which weight exceeds the scale's ideal weight for your height. The formula is proprietary.",
    why: "Weight-based like BMI, so it carries the same blind spots about muscle.",
    goodDirection: "down",
    trendMeaning: "Tracks weight. Adds nothing beyond weight and BMI.",
    actions: "Rely on fat %, visceral fat and waist circumference instead.",
    ranges: [],
  },
  {
    key: "bodyAge",
    label: "Body age",
    unit: "years",
    group: "Metabolic",
    decimals: 0,
    what: "The age whose average composition and metabolism most resembles yours, according to the scale's proprietary model.",
    why: "A motivational summary, not a clinical measure.",
    goodDirection: "down",
    trendMeaning: "Moves by whole years with small composition changes. Treat a one-year change as noise.",
    actions: "Do not use it for decisions; use the underlying fat, muscle and visceral values.",
    ranges: [],
  },
];

export const BODY_METRIC_BY_KEY: Record<BodyMetricKey, BodyMetricKnowledge> = Object.fromEntries(
  BODY_METRICS.map((m) => [m.key, m])
) as Record<BodyMetricKey, BodyMetricKnowledge>;

export const BODY_METRIC_GROUPS: BodyMetricGroup[] = [
  "Weight & BMI",
  "Fat",
  "Muscle & Protein",
  "Water & Bone",
  "Metabolic",
];

/** Best matching range for the person, or null when the metric is not graded. */
export function findRange(
  key: BodyMetricKey,
  sex: "male" | "female" | null,
  age: number | null
): ReferenceRange | null {
  const ranges = BODY_METRIC_BY_KEY[key].ranges;
  const matches = ranges.filter(
    (r) =>
      (r.sex === "any" || (sex !== null && r.sex === sex)) &&
      (age === null || (age >= r.minAge && age <= r.maxAge))
  );
  return matches.find((r) => r.sex !== "any") ?? matches[0] ?? null;
}
