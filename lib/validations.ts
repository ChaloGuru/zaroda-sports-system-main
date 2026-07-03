import { z } from "zod";

// z.string().email().optional() still runs the email-format check against an
// empty string (forms submit "" for a blank field, not undefined), making an
// "optional" field reject a blank input. These treat "" as "not provided".
const emptyToUndefined = (val: unknown) => (val === "" ? undefined : val);
const optionalEmail = z.preprocess(emptyToUndefined, z.string().email().nullable().optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().nullable().optional());

export const accountTypeSchema = z.enum(["SCHOOL", "OPEN_TOURNAMENT"]);
export const gameCategorySchema = z.enum(["BALL_GAMES", "ATHLETICS", "MUSIC", "OTHER_GAMES"]);
export const levelSchema = z.enum(["BASE", "ZONE", "SUB_COUNTY", "COUNTY", "REGIONAL", "NATIONAL"]);
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
// updates may only touch one of startDate/endDate at a time).
export const championshipUpdateSchema = championshipFieldsSchema.partial();
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
});
export type TournamentTeamInput = z.infer<typeof tournamentTeamSchema>;

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

export const roleAssignmentSchema = z.object({
  userId: z.string().uuid().optional(),
  email: optionalEmail,
  name: z.string().max(200).optional(),
  password: passwordSchema.optional(),
  role: z.enum(["TOURNAMENT_ADMIN", "SCOREKEEPER", "OFFICIAL"]),
  championshipId: z.string().uuid(),
});
export type RoleAssignmentInput = z.infer<typeof roleAssignmentSchema>;

export const championshipFeeSchema = z.object({
  championshipId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  amountKes: z.number().int().min(0),
  isRequired: z.boolean().default(true),
});
export type ChampionshipFeeInput = z.infer<typeof championshipFeeSchema>;
