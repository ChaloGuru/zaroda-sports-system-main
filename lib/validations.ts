import { z } from "zod";

// z.string().email().optional() still runs the email-format check against an
// empty string (forms submit "" for a blank field, not undefined), making an
// "optional" field reject a blank input. These treat "" as "not provided".
const emptyToUndefined = (val: unknown) => (val === "" ? undefined : val);
const optionalEmail = z.preprocess(emptyToUndefined, z.string().email().nullable().optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().nullable().optional());

export const accountTypeSchema = z.enum(["SCHOOL", "OPEN_TOURNAMENT"]);
export const gameCategorySchema = z.enum(["BALL_GAMES", "ATHLETICS", "MUSIC", "OTHER_GAMES"]);
export const levelSchema = z.enum(["BASE", "ZONE", "SUB_COUNTY", "COUNTY", "REGIONAL", "NATIONAL", "OPEN_TOURNAMENT"]);
// Championship.schoolLevel is the subscription/pricing tier - only ever one of
// these three values (Primary and Junior Secondary are bundled as one tier).
export const schoolLevelSchema = z.enum(["PRIMARY_JS", "SENIOR_SCHOOL", "TERTIARY"]);
// Game.schoolLevel is more granular: within a PRIMARY_JS championship, each
// event is individually Primary or JS; Senior School/Tertiary championships
// have exactly one valid value each, so the field is hidden and auto-set.
export const gameSchoolLevelSchema = z.enum(["PRIMARY", "JS", "SENIOR_SCHOOL", "TERTIARY"]);
export const genderSchema = z.enum(["BOYS", "GIRLS", "MIXED"]);
export const participantStatusSchema = z.enum(["REGISTERED", "CONFIRMED_IN_CALL_ROOM", "DISQUALIFIED"]);

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number");

export const signupSchema = z
  .object({
    accountType: accountTypeSchema,
    organizationName: z.string().min(2, "Organization name is required").max(200),
    contactName: z.string().min(2, "Contact name is required").max(200),
    email: z.string().email("Enter a valid email"),
    phone: z.string().min(7, "Enter a valid phone number").max(20),
    county: z.string().min(1, "Select a county"),
    subcounty: z.string().min(1, "Select a sub-county"),
    gameCategory: gameCategorySchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

const championshipFieldsSchema = z.object({
  name: z.string().min(3).max(200),
  level: levelSchema,
  schoolLevel: schoolLevelSchema,
  category: gameCategorySchema,
  county: z.string().min(1),
  location: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isPublished: z.boolean().default(false),
});
export const championshipCreateSchema = championshipFieldsSchema.refine(
  (data) => data.endDate >= data.startDate,
  { message: "End date must be after start date", path: ["endDate"] },
);
export type ChampionshipCreateInput = z.infer<typeof championshipCreateSchema>;

// Used for PATCH: all fields optional, without the cross-field refine (partial
// updates may only touch one of startDate/endDate at a time). tenantId is
// only honored for the caller when they're a super admin (enforced in the
// route) - it lets a championship a super admin created ahead of time be
// handed off once the actual tenant subscribes.
export const championshipUpdateSchema = championshipFieldsSchema.partial().extend({
  tenantId: z.string().uuid().optional(),
});
export type ChampionshipUpdateInput = z.infer<typeof championshipUpdateSchema>;

export const ballSportSchema = z.enum([
  "FOOTBALL",
  "BASKETBALL",
  "VOLLEYBALL",
  "HANDBALL",
  "RUGBY",
  "NETBALL",
  "CHESS",
  "TABLE_TENNIS",
  "BADMINTON",
]);

export const gameCreateSchema = z.object({
  championshipId: z.string().uuid(),
  name: z.string().min(2).max(200),
  category: gameCategorySchema,
  gender: genderSchema,
  schoolLevel: gameSchoolLevelSchema,
  isTimed: z.boolean(),
  sport: ballSportSchema.nullable().optional(),
  maxQualifiers: z.number().int().min(1).max(50).default(5),
  raceType: z.string().max(100).nullable().optional(),
  scheduledDate: z.coerce.date().nullable().optional(),
});
export type GameCreateInput = z.infer<typeof gameCreateSchema>;

// Editing a game: any create field except the championship it belongs to
// (moving a game between championships would bypass their access checks),
// plus switching it on/off.
export const gameUpdateSchema = gameCreateSchema
  .omit({ championshipId: true })
  .partial()
  .extend({ isActive: z.boolean().optional() });

const schoolNameSchema = z.string().trim().min(2, "School names need at least 2 characters").max(200);

/** Adds one or more schools (one name per entry) to a championship's school list. */
export const championshipSchoolsAddSchema = z.object({
  championshipId: z.string().uuid(),
  names: z.array(schoolNameSchema).min(1, "Add at least one school").max(500),
  /** Defaults to the championship's own county when omitted. */
  county: z.string().trim().max(100).optional(),
});
export type ChampionshipSchoolsAddInput = z.infer<typeof championshipSchoolsAddSchema>;

export const championshipSchoolUpdateSchema = z.object({
  name: schoolNameSchema.optional(),
  county: z.string().trim().min(1).max(100).optional(),
});

export const gameBulkActionSchema = z.object({
  championshipId: z.string().uuid(),
  gameIds: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(["activate", "deactivate", "delete"]),
});
export type GameBulkActionInput = z.infer<typeof gameBulkActionSchema>;

export const participantCreateSchema = z.object({
  championshipId: z.string().uuid(),
  gameId: z.string().uuid(),
  schoolId: z.string().uuid().nullable().optional(),
  tournamentTeamId: z.string().uuid().nullable().optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  gender: genderSchema,
  dateOfBirth: z.coerce.date().nullable().optional(),
  bibNumber: z.number().int().positive().optional(),
  personalBest: z.string().max(20).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  jerseyNumber: z.number().int().positive().nullable().optional(),
  playingPosition: z.string().max(50).nullable().optional(),
});
export type ParticipantCreateInput = z.infer<typeof participantCreateSchema>;

const timeInputRegex = /^(\d+(\.\d+)?|\d+:[0-5]?\d(\.\d+)?)$/;
export const timeInputSchema = z
  .string()
  .regex(timeInputRegex, 'Time must be like "12.06", "0:12.06", or "1:23.45"');

export const resultEntrySchema = z.object({
  participantId: z.string().uuid(),
  timeInput: timeInputSchema.optional(),
  score: z.number().optional(),
  position: z.number().int().positive().optional(),
});
export type ResultEntryInput = z.infer<typeof resultEntrySchema>;

export const bibRangeSchema = z.object({
  championshipId: z.string().uuid(),
  schoolId: z.string().uuid(),
  rangeStart: z.number().int().positive(),
  rangeEnd: z.number().int().positive(),
}).refine((data) => data.rangeEnd >= data.rangeStart, {
  message: "rangeEnd must be >= rangeStart",
  path: ["rangeEnd"],
});
export type BibRangeInput = z.infer<typeof bibRangeSchema>;

export const circularSchema = z.object({
  title: z.string().min(2).max(200),
  content: z.string().min(1).max(20000),
  senderName: z.string().min(1).max(200),
  senderRole: z.string().max(100).default("National Admin"),
  targetLevel: levelSchema.default("NATIONAL"),
  isPublished: z.boolean().default(true),
  documentUrl: optionalUrl,
});
export type CircularInput = z.infer<typeof circularSchema>;

export const adminMessageSchema = z.object({
  recipientId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  isBroadcast: z.boolean().default(false),
});
export type AdminMessageInput = z.infer<typeof adminMessageSchema>;

export const contactFormSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email(),
  phone: z.string().max(20).optional(),
  subject: z.string().min(2).max(200),
  message: z.string().min(5).max(5000),
});
export type ContactFormInput = z.infer<typeof contactFormSchema>;

export const paymentInitializeSchema = z.object({
  mode: z.enum(["subscription", "team_fee"]),
  planId: z.string().uuid().optional(),
  championshipId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  teamName: z.string().min(1).max(200).optional(),
  teamCode: z.string().min(1).max(50).optional(),
  teamGender: genderSchema.optional(),
  contactEmail: optionalEmail,
  contactName: z.string().max(200).optional(),
  contactPhone: z.string().max(20).optional(),
  feeId: z.string().uuid().optional(),
});
export type PaymentInitializeInput = z.infer<typeof paymentInitializeSchema>;

export const paymentVerifySchema = z.object({
  reference: z.string().min(1),
});

// Gender is intentionally not collected here - it's derived server-side from
// the selected game (a team registers for one specific game, so its gender
// always matches that game's). Only name is required; everything else,
// including the game itself, is optional so the public team_fee
// self-registration flow (which doesn't pick a specific game) still works.
export const tournamentTeamSchema = z.object({
  championshipId: z.string().uuid(),
  gameId: z.string().uuid().nullable().optional(),
  poolId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  teamCode: z.string().max(50).nullable().optional(),
  teamColor: z.string().max(30).nullable().optional(),
  contactName: z.string().max(200).nullable().optional(),
  contactEmail: optionalEmail,
  contactPhone: z.string().max(20).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  // Not required at this base level - National/Open Tournament championships
  // have no meaningful county scope. dashboardCountyRequiredSchema below
  // re-adds the requirement for the levels where it matters.
  county: z.string().max(100).nullable().optional(),
});
export type TournamentTeamInput = z.infer<typeof tournamentTeamSchema>;

// Levels where a team's county is used to confirm it falls within the
// championship's geographic scope - kept in sync with
// GEOGRAPHICALLY_RESTRICTED_LEVELS in lib/authorize.ts, which enforces this
// server-side. Regional/National/Open Tournament championships draw from
// anywhere, so county isn't required for those.
export const COUNTY_REQUIRED_LEVELS = ["BASE", "ZONE", "SUB_COUNTY", "COUNTY"];

// Dashboard team creation (TeamsPanel) requires picking a game, unlike the
// public self-registration flow above.
export const dashboardTournamentTeamSchema = tournamentTeamSchema.extend({
  gameId: z.string().uuid("Select a game for this team"),
});

export const poolSchema = z.object({
  gameId: z.string().uuid(),
  name: z.string().min(1).max(100),
});
export type PoolInput = z.infer<typeof poolSchema>;

// Schedules a full round robin (bye-aware for odd counts) either within one
// pool, or across every team registered for the game when poolId is omitted.
export const generateFixturesSchema = z.object({
  gameId: z.string().uuid(),
  poolId: z.string().uuid().nullable().optional(),
});
export type GenerateFixturesInput = z.infer<typeof generateFixturesSchema>;

// Automatic pool -> knockout progression: takes the top N teams (by current
// pool standings) from every pool in the game and schedules a knockout-stage
// round robin among just the advancers.
export const advanceTopTeamsSchema = z.object({
  gameId: z.string().uuid(),
  topPerPool: z.number().int().min(1).max(4).default(1),
});
export type AdvanceTopTeamsInput = z.infer<typeof advanceTopTeamsSchema>;

// Advances the winners of a completed knockout round into an automatically
// paired next round (Round 1 -> Round 2 -> Semifinal -> Final, etc).
export const advanceRoundSchema = z.object({
  gameId: z.string().uuid(),
  roundName: z.string().min(1).max(100),
});
export type AdvanceRoundInput = z.infer<typeof advanceRoundSchema>;

// Promotes the top-N teams from a finished game into a higher-level
// championship's matching game, renaming/re-rostering them along the way.
export const promoteTeamsSchema = z.object({
  gameId: z.string().uuid(),
  targetChampionshipId: z.string().uuid(),
  topN: z.number().int().min(1).max(8).default(1),
});
export type PromoteTeamsInput = z.infer<typeof promoteTeamsSchema>;

// Promotes specific qualifying athletes (picked from the autogenerated
// Track & Field Final-only qualifiers list) into a higher-level
// championship's matching event, which must already exist there.
export const promoteAthletesSchema = z.object({
  participantIds: z.array(z.string().uuid()).min(1),
  targetChampionshipId: z.string().uuid(),
});
export type PromoteAthletesInput = z.infer<typeof promoteAthletesSchema>;

// Bulk-registers a list of participating organizations/schools as a team in
// every game the championship already has (e.g. 15 schools x 16 games ->
// 240 teams in one action), instead of creating each org/game combination
// by hand.
export const bulkTournamentTeamsSchema = z.object({
  championshipId: z.string().uuid(),
  organizationNames: z
    .array(z.string().min(1).max(200))
    .min(1, "Add at least one organization name"),
});
export type BulkTournamentTeamsInput = z.infer<typeof bulkTournamentTeamsSchema>;

export const matchPoolSchema = z.object({
  gameId: z.string().uuid(),
  // Set when manually adding a fixture into a specific pool (so it shows up
  // and is scored alongside that pool's auto-generated fixtures). Omitted/
  // null for knockout-stage fixtures that cross pool boundaries.
  poolId: z.string().uuid().nullable().optional(),
  roundName: z.string().max(100).default("Round 1"),
  // Which calendar day this fixture is played on - only meaningful for
  // championships spanning more than one day; left unset otherwise.
  matchDate: z.coerce.date().nullable().optional(),
  teamAId: z.string().uuid(),
  teamBId: z.string().uuid(),
  teamAScore: z.number().int().min(0).nullable().optional(),
  teamBScore: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});
export type MatchPoolInput = z.infer<typeof matchPoolSchema>;

export const roleAssignmentSchema = z
  .object({
    userId: z.string().uuid().optional(),
    email: optionalEmail,
    name: z.string().max(200).optional(),
    phone: z.string().max(30).optional(),
    role: z.enum([
      "TOURNAMENT_ADMIN",
      "SCOREKEEPER",
      "OFFICIAL",
      "GAME_COORDINATOR",
      "CHIEF_CALLROOM_MANAGER",
      "CHIEF_TRACK_JUDGE",
      "CHIEF_FIELD_JUDGE",
      "CHIEF_RECORDER",
      "TEAM_MANAGER",
    ]),
    championshipId: z.string().uuid(),
    // Required for TEAM_MANAGER only - the organization/team name this
    // assignment is scoped to (matches TournamentTeam.name, trimmed/lowercased).
    organizationName: z.string().min(1).max(200).optional(),
    // Optional sport/discipline scoping for operational roles - omitted/null
    // means unscoped (championship-wide) for that dimension.
    gameCategory: z.enum(["BALL_GAMES", "ATHLETICS", "MUSIC", "OTHER_GAMES"]).optional(),
    ballSport: z
      .enum(["FOOTBALL", "BASKETBALL", "VOLLEYBALL", "HANDBALL", "RUGBY", "NETBALL", "CHESS", "TABLE_TENNIS", "BADMINTON"])
      .optional(),
    athleticsType: z.enum(["TRACK", "FIELD"]).optional(),
  })
  .refine((data) => data.role !== "TEAM_MANAGER" || !!data.organizationName?.trim(), {
    message: "An organization name is required for the Team Manager role",
    path: ["organizationName"],
  });
export type RoleAssignmentInput = z.infer<typeof roleAssignmentSchema>;

// Editing an existing assignment - just the role/scope fields, no
// user-creation fields (email/name/phone/password aren't touched here).
export const roleUpdateSchema = z
  .object({
    role: z.enum([
      "TOURNAMENT_ADMIN",
      "SCOREKEEPER",
      "OFFICIAL",
      "GAME_COORDINATOR",
      "CHIEF_CALLROOM_MANAGER",
      "CHIEF_TRACK_JUDGE",
      "CHIEF_FIELD_JUDGE",
      "CHIEF_RECORDER",
      "TEAM_MANAGER",
    ]),
    organizationName: z.string().min(1).max(200).optional(),
    gameCategory: z.enum(["BALL_GAMES", "ATHLETICS", "MUSIC", "OTHER_GAMES"]).optional(),
    ballSport: z
      .enum(["FOOTBALL", "BASKETBALL", "VOLLEYBALL", "HANDBALL", "RUGBY", "NETBALL", "CHESS", "TABLE_TENNIS", "BADMINTON"])
      .optional(),
    athleticsType: z.enum(["TRACK", "FIELD"]).optional(),
  })
  .refine((data) => data.role !== "TEAM_MANAGER" || !!data.organizationName?.trim(), {
    message: "An organization name is required for the Team Manager role",
    path: ["organizationName"],
  });
export type RoleUpdateInput = z.infer<typeof roleUpdateSchema>;

export const championshipFeeSchema = z.object({
  championshipId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  amountKes: z.number().int().min(0),
  isRequired: z.boolean().default(true),
});
export type ChampionshipFeeInput = z.infer<typeof championshipFeeSchema>;

export const payoutAccountSchema = z.object({
  settlementBankCode: z.string().min(1).max(20),
  settlementBankName: z.string().min(1).max(200),
  accountNumber: z.string().min(1).max(50),
  // Only honored for the caller when they're a super admin (enforced in the
  // route) - a super admin has no tenant of their own, so they must name
  // which tenant they're configuring the payout account on behalf of.
  tenantId: z.string().uuid().optional(),
});
export type PayoutAccountInput = z.infer<typeof payoutAccountSchema>;

export const championshipCircularSchema = z.object({
  championshipId: z.string().uuid(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
});
export type ChampionshipCircularInput = z.infer<typeof championshipCircularSchema>;

export const testimonialSchema = z.object({
  message: z.string().trim().min(1, "Please write a few words about your experience").max(1000),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  allowPublicUse: z.boolean().default(true),
});
export type TestimonialInput = z.infer<typeof testimonialSchema>;

export const testimonialStatusSchema = z.object({
  status: z.enum(["SUBMITTED", "FEATURED", "ARCHIVED"]),
});

// ── KSEF ─────────────────────────────────────────────────────────────────
export const ksefDivisionSchema = z.enum(["JUNIOR_SCHOOL", "SENIOR_SCHOOL"]);
export const ksefLevelSchema = z.enum(["SUB_COUNTY", "COUNTY", "REGIONAL", "NATIONAL"]);
const optionalText = (max: number) => z.preprocess(emptyToUndefined, z.string().trim().max(max).nullable().optional());
const optionalDate = z.preprocess(emptyToUndefined, z.coerce.date().nullable().optional());

export const ksefEditionCreateSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    name: optionalText(100),
    startDate: optionalDate,
    endDate: optionalDate,
    configSource: z.enum(["STANDARD", "COPY", "EMPTY"]),
    copyFromEditionId: z.string().uuid().optional(),
  })
  .refine((d) => d.configSource !== "COPY" || !!d.copyFromEditionId, {
    message: "Pick the edition to copy the configuration from",
    path: ["copyFromEditionId"],
  });

export const ksefEditionUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "CLOSED"]).optional(),
  startDate: optionalDate,
  endDate: optionalDate,
  levels: z.array(ksefLevelSchema).min(1).optional(),
  currentLevel: ksefLevelSchema.optional(),
  qualifiersPerCategory: z.number().int().min(1).max(100).optional(),
  // From that year's KSEF rules - Zaroda sets no default. null clears it.
  discrepancyThreshold: z.number().positive().max(10000).nullable().optional(),
  discrepancyBasis: z.enum(["POINTS", "PERCENT"]).optional(),
});

export const ksefCategorySchema = z.object({
  editionId: z.string().uuid(),
  division: ksefDivisionSchema,
  name: z.string().trim().min(1).max(200),
});
export const ksefCategoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const ksefSubCategorySchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
});
export const ksefSubCategoryUpdateSchema = ksefCategoryUpdateSchema;

export const ksefCriterionSchema = z.object({
  editionId: z.string().uuid(),
  division: ksefDivisionSchema.nullable(),
  name: z.string().trim().min(1).max(200),
  description: optionalText(1000),
  maxScore: z.number().int().min(1).max(1000),
  section: optionalText(200),
  levelScored: z.boolean().default(false),
});
export const ksefCriterionUpdateSchema = z.object({
  division: ksefDivisionSchema.nullable().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  description: optionalText(1000),
  maxScore: z.number().int().min(1).max(1000).optional(),
  section: optionalText(200),
  levelScored: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const ksefSchoolSchema = z.union([
  z.object({ editionId: z.string().uuid(), schoolId: z.string().uuid() }),
  z.object({
    editionId: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    county: z.string().trim().min(1).max(100),
    subcounty: z.string().trim().min(1).max(100),
    zone: optionalText(100),
  }),
]);

const ksefLearnerSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  gender: z.enum(["BOYS", "GIRLS"]),
  grade: optionalText(30),
  upiNumber: optionalText(30),
});
const ksefMentorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  tscNumber: optionalText(30),
  phone: optionalText(30),
  email: optionalEmail,
});

export const ksefProjectSchema = z.object({
  editionId: z.string().uuid(),
  schoolId: z.string().uuid(),
  categoryId: z.string().uuid(),
  subCategoryId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(300),
  abstract: optionalText(5000),
  documentUrl: optionalUrl,
  learners: z.array(ksefLearnerSchema).max(10).default([]),
  mentors: z.array(ksefMentorSchema).max(5).default([]),
});
export const ksefProjectUpdateSchema = ksefProjectSchema.omit({ editionId: true }).partial();

// --- School self-registration (see lib/ksef-registration.ts) ---

export const ksefRegistrationLinkSchema = z.object({
  editionId: z.string().uuid(),
  // OPEN creates the link (or keeps the current one), ROTATE replaces it so
  // the old one stops working, CLOSE turns registration off, DEADLINE only
  // changes closesAt.
  action: z.enum(["OPEN", "ROTATE", "CLOSE", "DEADLINE"]),
  closesAt: optionalDate,
});

export const ksefSchoolRegistrationSchema = z.object({
  token: z.string().min(1).max(100),
  schoolName: z.string().trim().min(2).max(200),
  county: z.string().trim().min(1).max(100),
  subcounty: z.string().trim().min(1).max(100),
  zone: optionalText(100),
  divisions: z
    .array(z.enum(["JUNIOR_SCHOOL", "SENIOR_SCHOOL"]), { required_error: "Choose your school's level" })
    .min(1, "Choose your school's level")
    .max(2)
    .transform((divisions) => Array.from(new Set(divisions))),
  contactName: z.string().trim().min(2).max(200),
  contactEmail: z.string().trim().toLowerCase().email(),
  contactPhone: optionalText(30),
});

export const ksefPortalProjectSchema = z.object({
  categoryId: z.string().uuid(),
  subCategoryId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(300),
  abstract: optionalText(5000),
  documentUrl: optionalUrl,
  learners: z.array(ksefLearnerSchema).min(1, "Add at least one learner").max(2, "A project can have at most 2 learners"),
  mentors: z.array(ksefMentorSchema).min(1, "Add the project's mentor").max(5),
});

export const ksefRegistrationDecisionSchema = z.discriminatedUnion("action", [
  // schoolId links the registration to a school already on record instead
  // of accepting the one it created.
  z.object({ action: z.literal("APPROVE"), schoolId: z.string().uuid().optional() }),
  z.object({ action: z.literal("REJECT"), reason: z.string().trim().min(1, "Give a reason").max(500) }),
]);

export const ksefAssignmentSchema = z.object({
  // Every judge listed is assigned every project listed.
  judgeIds: z.array(z.string().uuid()).min(1, "Pick at least one judge").max(100),
  projectIds: z.array(z.string().uuid()).min(1).max(500),
  level: ksefLevelSchema,
});

export const ksefAutoAssignSchema = z.object({
  editionId: z.string().uuid(),
  level: ksefLevelSchema,
  // Which school level's projects to cover - or every project at this level.
  division: z.enum(["ALL", "JUNIOR_SCHOOL", "SENIOR_SCHOOL"]),
  judgeIds: z.array(z.string().uuid()).min(1, "Pick at least one judge").max(100),
  judgesPerProject: z.number().int().min(1).max(10),
});

export const ksefScoreSheetSchema = z.object({
  scores: z
    .array(
      z.object({
        criterionId: z.string().uuid(),
        score: z
          .number()
          .min(0, "Scores can't be negative")
          .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-9, "Scores can have at most 2 decimal places"),
      }),
    )
    .max(100),
  comment: optionalText(2000),
  submit: z.boolean().default(false),
});

export const ksefLevelActionSchema = z.object({
  editionId: z.string().uuid(),
  level: ksefLevelSchema,
  action: z.enum(["CALCULATE", "PUBLISH", "PROGRESS"]),
});

export const ksefReviewActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("NOTE"), note: z.string().trim().min(1, "Write the note").max(5000) }),
  z.object({
    action: z.literal("APPROVE"),
    note: z.string().trim().min(1, "A resolution note is required to approve").max(5000),
    finalScoreBasis: z.enum(["AVERAGE_OF_JUDGES", "CHIEF_JUDGE_DETERMINED"]),
    finalScore: z.number().min(0).optional(),
  }),
  z.object({ action: z.literal("REOPEN"), note: z.string().trim().min(1, "Give the reason for reopening").max(5000) }),
]);

export const ksefComplaintSchema = z.object({
  editionId: z.string().uuid(),
  projectId: z.string().uuid(),
  level: ksefLevelSchema,
  complainantName: z.string().trim().min(1).max(200),
  complainantRole: z.string().trim().min(1).max(100),
  subject: z.string().trim().min(1).max(300),
  details: z.string().trim().min(1, "Write out the complaint in full").max(10000),
  documentUrl: optionalUrl,
});

export const ksefComplaintActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("NOTE"), note: z.string().trim().min(1, "Write the note").max(5000) }),
  z.object({ action: z.literal("START_REVIEW"), note: optionalText(5000) }),
  z.object({
    action: z.literal("DECIDE"),
    outcome: z.enum(["UPHELD", "DISMISSED"]),
    decision: z.string().trim().min(1, "The SRC decision must be recorded in writing").max(10000),
  }),
  z.object({ action: z.literal("REOPEN"), note: z.string().trim().min(1, "Give the reason for reopening").max(5000) }),
]);

export const ksefInviteSchema = z.object({
  editionId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  name: optionalText(200),
  phone: optionalText(30),
  specialty: optionalText(200),
  role: z.enum(["JUDGE", "CHIEF_JUDGE", "SRC_MEMBER"]).default("JUDGE"),
});

/** Accepting a panel invitation - name/password only needed when creating a new account. */
export const ksefInviteAcceptSchema = z.object({
  token: z.string().min(20).max(200),
  name: optionalText(200),
  phone: optionalText(30),
  password: passwordSchema.optional(),
});
