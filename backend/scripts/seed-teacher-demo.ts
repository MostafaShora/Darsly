import { calculateProratedInvoiceAmount } from "../src/utils/money";

const API_BASE_URL = "https://darsly-centeer.vercel.app/api";
const TARGET_EMAIL = "mm7326745@gmail.com";
const DEMO_VERSION = "teacher-demo-2026-11-v1";
const AS_OF_DATE = "2026-11-27";
const WORKSPACE_TIME_ZONE = "Africa/Cairo";

type ApiRecord = Record<string, unknown> & {
    id?: string;
    _id?: string;
};

type ApiEnvelope<T> = {
    data: T;
    message?: string;
};

type ApiPage<T> = {
    items: T[];
    pagination: {
        totalPages: number;
    };
};

type StudentPlan = {
    key: string;
    name: string;
    grade: string;
    schoolName: string;
    joinDate: string;
};

type SubjectPlan = {
    key: string;
    name: string;
    description: string;
};

type GroupPlan = {
    key: string;
    name: string;
    subjectKey: string;
    description: string;
    monthlyFee: string;
    capacity: number;
    weekday: number;
    weekdayName: string;
    hour: number;
};

type EnrollmentPlan = {
    key: string;
    studentKey: string;
    groupKey: string;
    enrolledAt: string;
};

type SessionPlan = {
    key: string;
    groupKey: string;
    date: string;
    startsAt: string;
    endsAt: string;
    past: boolean;
};

type AttendancePlan = {
    key: string;
    sessionKey: string;
    studentKey: string;
    status: "present" | "absent" | "late" | "excused";
    lateMinutes?: number;
};

type InvoicePlan = {
    key: string;
    studentKey: string;
    enrollmentKey: string;
    groupKey: string;
    periodStart: string;
    periodEnd: string;
    expectedTotal: string;
};

type AllocationPlan = {
    invoiceKey: string;
    amount: string;
};

type PaymentPlan = {
    key: string;
    studentKey: string;
    amount: string;
    method: "cash" | "bank_transfer" | "card" | "wallet";
    receivedAt: string;
    allocations: AllocationPlan[];
};

type SeedPlan = {
    students: StudentPlan[];
    subjects: SubjectPlan[];
    groups: GroupPlan[];
    enrollments: EnrollmentPlan[];
    sessions: SessionPlan[];
    attendance: AttendancePlan[];
    invoices: InvoicePlan[];
    payments: PaymentPlan[];
};

type CountKey =
    | "students"
    | "guardians"
    | "guardianLinks"
    | "subjects"
    | "groups"
    | "enrollments"
    | "sessions"
    | "attendance"
    | "invoices"
    | "payments"
    | "allocations";

type Counts = Record<CountKey, { created: number; skipped: number; updated: number }>;

const students: StudentPlan[] = [
    ["01", "سليم عبدالسلام", "الصف الأول الثانوي", "مدرسة النيل الثانوية"],
    ["02", "مريم الشاذلي", "الصف الثاني الثانوي", "مدرسة المستقبل الرسمية"],
    ["03", "يوسف العطار", "الصف الأول الثانوي", "مدرسة النيل الثانوية"],
    ["04", "ليلى منصور", "الصف الثالث الإعدادي", "مدرسة الأمل للغات"],
    ["05", "عمر فؤاد", "الصف الثاني الثانوي", "مدرسة المستقبل الرسمية"],
    ["06", "نورهان سامي", "الصف الأول الثانوي", "مدرسة الأمل للغات"],
    ["07", "آدم شريف", "الصف الثالث الإعدادي", "مدرسة النيل الثانوية"],
    ["08", "جنى مصطفى", "الصف الثاني الثانوي", "مدرسة المستقبل الرسمية"],
    ["09", "زياد حمدي", "الصف الأول الثانوي", "مدرسة الأمل للغات"],
    ["10", "ملك إبراهيم", "الصف الثالث الإعدادي", "مدرسة النيل الثانوية"],
    ["11", "كريم طارق", "الصف الثاني الثانوي", "مدرسة المستقبل الرسمية"],
    ["12", "فرح محمود", "الصف الأول الثانوي", "مدرسة الأمل للغات"],
    ["13", "حمزة عادل", "الصف الثالث الإعدادي", "مدرسة النيل الثانوية"],
    ["14", "تاليا خالد", "الصف الثاني الثانوي", "مدرسة المستقبل الرسمية"],
    ["15", "مالك رامي", "الصف الأول الثانوي", "مدرسة الأمل للغات"],
    ["16", "هنا وائل", "الصف الثالث الإعدادي", "مدرسة النيل الثانوية"],
    ["17", "إياد جابر", "الصف الثاني الثانوي", "مدرسة المستقبل الرسمية"],
    ["18", "رؤى أشرف", "الصف الأول الثانوي", "مدرسة الأمل للغات"],
    ["19", "فارس حسام", "الصف الثالث الإعدادي", "مدرسة النيل الثانوية"],
    ["20", "دانا نبيل", "الصف الثاني الثانوي", "مدرسة المستقبل الرسمية"],
].map(([key, name, grade, schoolName], index) => ({
    key: `student-${key}`,
    name,
    grade,
    schoolName,
    joinDate: `2026-09-${String(8 + (index % 18)).padStart(2, "0")}`,
}));

const subjects: SubjectPlan[] = [
    {
        key: "mathematics",
        name: "رياضيات — تجربة Darsly",
        description: "مراجعة المفاهيم وحل المسائل. بيانات تعليمية تجريبية.",
    },
    {
        key: "physics",
        name: "فيزياء — تجربة Darsly",
        description: "شرح وتطبيقات فيزياء المرحلة الثانوية. بيانات تجريبية.",
    },
    {
        key: "chemistry",
        name: "كيمياء — تجربة Darsly",
        description: "أساسيات الكيمياء والتدريب على المسائل. بيانات تجريبية.",
    },
    {
        key: "english",
        name: "لغة إنجليزية — تجربة Darsly",
        description: "قواعد ومفردات ومحادثة. بيانات تعليمية تجريبية.",
    },
];

const groups: GroupPlan[] = [
    {
        key: "math-foundation",
        name: "رياضيات تأسيس — تجربة",
        subjectKey: "mathematics",
        description: "الإثنين 16:00 بتوقيت القاهرة. مجموعة تأسيسية تجريبية.",
        monthlyFee: "650",
        capacity: 12,
        weekday: 1,
        weekdayName: "الإثنين",
        hour: 16,
    },
    {
        key: "math-advanced",
        name: "رياضيات متقدم — تجربة",
        subjectKey: "mathematics",
        description: "الثلاثاء 16:00 بتوقيت القاهرة. تدريب متقدم تجريبي.",
        monthlyFee: "800",
        capacity: 12,
        weekday: 2,
        weekdayName: "الثلاثاء",
        hour: 16,
    },
    {
        key: "physics",
        name: "فيزياء ثانوي — تجربة",
        subjectKey: "physics",
        description: "الأربعاء 17:00 بتوقيت القاهرة. مجموعة ثانوية تجريبية.",
        monthlyFee: "900",
        capacity: 12,
        weekday: 3,
        weekdayName: "الأربعاء",
        hour: 17,
    },
    {
        key: "chemistry",
        name: "كيمياء ثانوي — تجربة",
        subjectKey: "chemistry",
        description: "الخميس 17:00 بتوقيت القاهرة. مجموعة ثانوية تجريبية.",
        monthlyFee: "850",
        capacity: 12,
        weekday: 4,
        weekdayName: "الخميس",
        hour: 17,
    },
    {
        key: "english",
        name: "إنجليزي ثانوي — تجربة",
        subjectKey: "english",
        description: "السبت 12:00 بتوقيت القاهرة. مجموعة ثانوية تجريبية.",
        monthlyFee: "700",
        capacity: 12,
        weekday: 6,
        weekdayName: "السبت",
        hour: 12,
    },
];

const marker = (kind: string, key: string): string =>
    `DARS-DEMO:${DEMO_VERSION}:${kind}:${key}`;

const field = (record: ApiRecord, key: string): string =>
    record[key] === null || record[key] === undefined
        ? ""
        : String(record[key]);

const isApiRecord = (value: unknown): value is ApiRecord =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const recordId = (record: ApiRecord): string => {
    const id = field(record, "id") || field(record, "_id");
    if (!id) throw new Error("An API record did not include an ID.");
    return id;
};

const decimalCents = (value: string): number => {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
    if (!match) throw new Error(`Unexpected monetary value returned by API.`);
    return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
};

const centsDecimal = (value: number): string =>
    `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;

const localToUtcIso = (date: string, hour: number, minute: number): string => {
    const [year, month, day] = date.split("-").map(Number);
    const roughUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
    const offsetName = new Intl.DateTimeFormat("en-US", {
        timeZone: WORKSPACE_TIME_ZONE,
        timeZoneName: "longOffset",
    })
        .formatToParts(roughUtc)
        .find((part) => part.type === "timeZoneName")?.value;
    const offset = /GMT([+-])(\d{2}):(\d{2})/.exec(offsetName ?? "GMT");
    const offsetMinutes = offset
        ? (Number(offset[2]) * 60 + Number(offset[3])) *
        (offset[1] === "+" ? 1 : -1)
        : 0;
    return new Date(roughUtc.getTime() - offsetMinutes * 60_000).toISOString();
};

const dateKey = (date: Date): string => date.toISOString().slice(0, 10);

const scheduledDates = (weekday: number): { date: string; past: boolean }[] => {
    const anchor = new Date(`${AS_OF_DATE}T00:00:00.000Z`);
    const since = (anchor.getUTCDay() - weekday + 7) % 7 || 7;
    const until = (weekday - anchor.getUTCDay() + 7) % 7 || 7;
    const dates: { date: string; past: boolean }[] = [];

    for (let week = 0; week < 4; week += 1) {
        dates.push({
            date: dateKey(new Date(anchor.getTime() - (since + week * 7) * 86_400_000)),
            past: true,
        });
    }

    for (let week = 0; week < 2; week += 1) {
        dates.push({
            date: dateKey(new Date(anchor.getTime() + (until + week * 7) * 86_400_000)),
            past: false,
        });
    }

    return dates.sort((left, right) => left.date.localeCompare(right.date));
};

const enrollments: EnrollmentPlan[] = students.flatMap((student, index) => {
    const groupIndexes = [index % groups.length, (index + 2) % groups.length];
    return groupIndexes.map((groupIndex) => ({
        key: `${student.key}:${groups[groupIndex].key}`,
        studentKey: student.key,
        groupKey: groups[groupIndex].key,
        enrolledAt: `${student.joinDate}T00:00:00.000Z`,
    }));
});

const sessions: SessionPlan[] = groups.flatMap((group) =>
    scheduledDates(group.weekday).map(({ date, past }) => {
        const startsAt = localToUtcIso(date, group.hour, 0);
        return {
            key: `${group.key}:${date}`,
            groupKey: group.key,
            date,
            startsAt,
            endsAt: new Date(new Date(startsAt).getTime() + 75 * 60_000).toISOString(),
            past,
        };
    }),
);

const attendance: AttendancePlan[] = sessions
    .filter((session) => session.past)
    .flatMap((session, sessionIndex) =>
        enrollments
            .filter((enrollment) => enrollment.groupKey === session.groupKey)
            .map((enrollment, rosterIndex) => {
                const outcome = (sessionIndex + rosterIndex) % 10;
                const status =
                    outcome < 6
                        ? "present"
                        : outcome < 8
                            ? "absent"
                            : outcome === 8
                                ? "late"
                                : "excused";
                return {
                    key: `${session.key}:${enrollment.studentKey}`,
                    sessionKey: session.key,
                    studentKey: enrollment.studentKey,
                    status,
                    ...(status === "late"
                        ? { lateMinutes: 5 + ((sessionIndex + rosterIndex) % 16) }
                        : {}),
                };
            }),
    );

const invoices: InvoicePlan[] = enrollments.flatMap((enrollment) => {
    const student = students.find((item) => item.key === enrollment.studentKey);
    const group = groups.find((item) => item.key === enrollment.groupKey);
    if (!student || !group) throw new Error("Invalid demo enrollment plan.");
    const firstMonthEnd = "2026-09-30";
    return [
        {
            key: `${enrollment.key}:2026-09`,
            studentKey: enrollment.studentKey,
            enrollmentKey: enrollment.key,
            groupKey: enrollment.groupKey,
            periodStart: student.joinDate,
            periodEnd: firstMonthEnd,
            expectedTotal: calculateProratedInvoiceAmount(
                group.monthlyFee,
                student.joinDate,
                firstMonthEnd,
            ),
        },
        {
            key: `${enrollment.key}:2026-10`,
            studentKey: enrollment.studentKey,
            enrollmentKey: enrollment.key,
            groupKey: enrollment.groupKey,
            periodStart: "2026-10-01",
            periodEnd: "2026-10-31",
            expectedTotal: calculateProratedInvoiceAmount(
                group.monthlyFee,
                "2026-10-01",
                "2026-10-31",
            ),
        },
    ];
});

const payments: PaymentPlan[] = [];

for (const [studentIndex, student] of students.entries()) {
    const studentInvoices = invoices.filter(
        (invoice) => invoice.studentKey === student.key,
    );
    const allocatedInvoiceKeys = new Set<string>();

    if (studentIndex % 5 === 0 && studentInvoices.length >= 2) {
        const first = studentInvoices[0];
        const second = studentInvoices[1];
        const firstCents = decimalCents(first.expectedTotal);
        const secondCents = decimalCents(second.expectedTotal);
        const partialCents = Math.max(1, Math.round(secondCents / 2));
        payments.push({
            key: `bundle:${student.key}`,
            studentKey: student.key,
            amount: centsDecimal(firstCents + partialCents),
            method: "bank_transfer",
            receivedAt: "2026-11-15T14:00:00+02:00",
            allocations: [
                { invoiceKey: first.key, amount: centsDecimal(firstCents) },
                { invoiceKey: second.key, amount: centsDecimal(partialCents) },
            ],
        });
        allocatedInvoiceKeys.add(first.key);
        allocatedInvoiceKeys.add(second.key);
    }

    for (const [invoiceIndex, invoice] of studentInvoices.entries()) {
        if (allocatedInvoiceKeys.has(invoice.key)) continue;
        const cycle = (studentIndex + invoiceIndex) % 4;
        if (cycle === 2) continue;

        const total = decimalCents(invoice.expectedTotal);
        const amount = cycle === 1 ? Math.max(1, Math.round(total / 2)) : total;
        payments.push({
            key: `invoice:${invoice.key}`,
            studentKey: student.key,
            amount: centsDecimal(amount),
            method: (["cash", "card", "wallet", "bank_transfer"] as const)[
                (studentIndex + invoiceIndex) % 4
            ],
            receivedAt: `2026-11-${String(5 + (studentIndex % 22)).padStart(2, "0")}T14:00:00+02:00`,
            allocations: [{ invoiceKey: invoice.key, amount: centsDecimal(amount) }],
        });
    }

    if (studentIndex % 5 === 1) {
        payments.push({
            key: `unallocated:${student.key}`,
            studentKey: student.key,
            amount: "250.00",
            method: "cash",
            receivedAt: "2026-11-26T14:00:00+02:00",
            allocations: [],
        });
    }
}

const buildSeedPlan = (): SeedPlan => ({ students, subjects, groups, enrollments, sessions, attendance, invoices, payments });

class ApiClient {
    private cookie = "";

    async login(email: string, password: string): Promise<void> {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        if (!response.ok) {
            throw new Error(`Teacher authentication failed (HTTP ${response.status}).`);
        }

        const cookieHeader = response.headers.get("set-cookie") ?? "";
        const token = /(?:^|[,;]\s*)accessToken=([^;]+)/.exec(cookieHeader)?.[1];
        if (!token) throw new Error("The authenticated API did not return its session cookie.");
        this.cookie = `accessToken=${token}`;
    }

    async request<T>(
        method: string,
        path: string,
        body?: unknown,
    ): Promise<T> {
        const headers: Record<string, string> = { cookie: this.cookie };
        if (body !== undefined) headers["content-type"] = "application/json";
        const response = await fetch(`${API_BASE_URL}${path}`, {
            method,
            headers,
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        let payload: ApiEnvelope<T> | { message?: string };
        try {
            payload = (await response.json()) as ApiEnvelope<T>;
        } catch {
            throw new Error(`${method} ${path} returned an unreadable API response (HTTP ${response.status}).`);
        }
        if (!response.ok) {
            const message = typeof payload.message === "string" ? payload.message : "Request rejected";
            throw new Error(`${method} ${path} failed (HTTP ${response.status}): ${message}`);
        }
        return payload as ApiEnvelope<T> as T;
    }

    async get<T>(path: string): Promise<T> {
        return this.request<T>("GET", path);
    }

    async post<T>(path: string, body: unknown): Promise<T> {
        return this.request<T>("POST", path, body);
    }

    async patch<T>(path: string, body: unknown): Promise<T> {
        return this.request<T>("PATCH", path, body);
    }
}

const readHiddenInput = async (prompt: string): Promise<string> => {
    const input = process.stdin as NodeJS.ReadStream & {
        setRawMode?: (enabled: boolean) => void;
    };
    if (!input.isTTY || !input.setRawMode) {
        throw new Error("Run this command in an interactive terminal for the hidden password prompt.");
    }

    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();

    return new Promise((resolve, reject) => {
        let value = "";
        const finish = (error?: Error) => {
            input.setRawMode?.(false);
            input.pause();
            input.removeListener("data", onData);
            process.stdout.write("\n");
            if (error) reject(error);
            else resolve(value);
        };
        const onData = (chunk: Buffer | string) => {
            for (const character of chunk.toString()) {
                if (character === "\u0003") {
                    finish(new Error("Password prompt cancelled."));
                    return;
                }
                if (character === "\r" || character === "\n") {
                    finish();
                    return;
                }
                if (character === "\u007f" || character === "\b") {
                    value = value.slice(0, -1);
                } else {
                    value += character;
                }
            }
        };
        input.on("data", onData);
    });
};

const dataFrom = <T>(envelope: ApiEnvelope<T>): T => envelope.data;

const getAll = async (
    api: ApiClient,
    basePath: string,
): Promise<ApiRecord[]> => {
    const result: ApiRecord[] = [];
    let page = 1;
    let totalPages = 1;
    do {
        const response = await api.get<ApiEnvelope<ApiPage<ApiRecord>>>(
            `${basePath}${basePath.includes("?") ? "&" : "?"}page=${page}&pageSize=100`,
        );
        const pageData = dataFrom(response);
        result.push(...pageData.items);
        totalPages = Math.max(1, pageData.pagination.totalPages);
        page += 1;
    } while (page <= totalPages);
    return result;
};

const allMarked = (
    records: ApiRecord[],
    value: string,
): ApiRecord[] =>
    records.filter((record) =>
        Object.values(record).some(
            (item) => typeof item === "string" && item.includes(value),
        ),
    );

const findMarked = (
    records: ApiRecord[],
    value: string,
    label: string,
): ApiRecord | undefined => {
    const matches = allMarked(records, value);
    if (matches.length > 1) throw new Error(`Duplicate demo marker found for ${label}.`);
    return matches[0];
};

const queryValue = (value: string): string => encodeURIComponent(value);

const loadSnapshot = async (api: ApiClient, workspaceId: string) => {
    const root = `/workspaces/${encodeURIComponent(workspaceId)}`;
    const [studentsNow, guardiansNow, subjectsNow, groupsNow, enrollmentsNow, sessionsNow, invoicesNow, paymentsNow] =
        await Promise.all([
            getAll(api, `${root}/students`),
            getAll(api, `${root}/guardians`),
            getAll(api, `${root}/subjects`),
            getAll(api, `${root}/groups`),
            getAll(api, `${root}/enrollments`),
            getAll(
                api,
                `${root}/sessions?from=${queryValue("2026-09-01T00:00:00.000Z")}&to=${queryValue("2027-01-01T00:00:00.000Z")}`,
            ),
            getAll(api, `${root}/invoices`),
            getAll(api, `${root}/payments`),
        ]);
    return {
        root,
        students: studentsNow,
        guardians: guardiansNow,
        subjects: subjectsNow,
        groups: groupsNow,
        enrollments: enrollmentsNow,
        sessions: sessionsNow,
        invoices: invoicesNow,
        payments: paymentsNow,
    };
};

const buildPlan = (): SeedPlan => buildSeedPlan();

const preflight = async (
    api: ApiClient,
    plan: SeedPlan,
    snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
): Promise<void> => {
    for (const student of plan.students) {
        const existing = findMarked(
            snapshot.students,
            marker("student", student.key),
            student.key,
        );
        const email = `demo.${student.key}@example.test`;
        const collision = snapshot.students.find(
            (record) => field(record, "email")?.toLowerCase() === email,
        );
        if (!existing && collision) {
            throw new Error(`Unmarked Student email collision for ${student.key}; no writes were started.`);
        }
    }

    for (const subject of plan.subjects) {
        const existing = findMarked(
            snapshot.subjects,
            marker("subject", subject.key),
            subject.key,
        );
        if (
            !existing &&
            snapshot.subjects.some((record) => field(record, "name") === subject.name)
        ) {
            throw new Error(`Unmarked Subject name collision for ${subject.name}; no writes were started.`);
        }
    }

    for (const [index] of plan.students.slice(0, 12).entries()) {
        const key = `guardian-${String(index + 1).padStart(2, "0")}`;
        const email = `demo.${key}@example.test`;
        const phone = `000000000${String(index + 1).padStart(2, "0")}`;
        const existing = findMarked(
            snapshot.guardians,
            marker("guardian", key),
            key,
        );
        if (
            !existing &&
            snapshot.guardians.some(
                (record) =>
                    field(record, "email").toLowerCase() === email ||
                    field(record, "phone") === phone,
            )
        ) {
            throw new Error(`Unmarked Guardian contact collision for ${key}; no writes were started.`);
        }
    }

    for (const group of plan.groups) {
        const existing = findMarked(
            snapshot.groups,
            marker("group", group.key),
            group.key,
        );
        if (
            !existing &&
            snapshot.groups.some((record) => field(record, "name") === group.name)
        ) {
            throw new Error(`Unmarked Study Group name collision for ${group.name}; no writes were started.`);
        }
    }

    const studentIds = new Map(
        plan.students.flatMap((item) => {
            const record = findMarked(
                snapshot.students,
                marker("student", item.key),
                item.key,
            );
            return record ? [[item.key, recordId(record)] as const] : [];
        }),
    );
    const groupIds = new Map(
        plan.groups.flatMap((item) => {
            const record = findMarked(
                snapshot.groups,
                marker("group", item.key),
                item.key,
            );
            return record ? [[item.key, recordId(record)] as const] : [];
        }),
    );

    for (const enrollment of plan.enrollments) {
        const marked = findMarked(
            snapshot.enrollments,
            marker("enrollment", enrollment.key),
            enrollment.key,
        );
        if (marked && field(marked, "status") !== "active") {
            throw new Error(`Marked Enrollment ${enrollment.key} is not active; no writes were started.`);
        }
        const studentId = studentIds.get(enrollment.studentKey);
        const groupId = groupIds.get(enrollment.groupKey);
        if (!studentId || !groupId) continue;
        const activeCollision = snapshot.enrollments.find(
            (record) =>
                field(record, "studentId") === studentId &&
                field(record, "groupId") === groupId &&
                field(record, "status") === "active" &&
                !field(record, "notes").includes(marker("enrollment", enrollment.key)),
        );
        if (activeCollision) {
            throw new Error(`An unmarked active Enrollment already exists for ${enrollment.key}; no writes were started.`);
        }
    }

    for (const group of plan.groups) {
        const groupId = groupIds.get(group.key);
        if (!groupId) continue;
        const existingGroup = findMarked(
            snapshot.groups,
            marker("group", group.key),
            group.key,
        );
        if (!existingGroup) continue;
        const activeCount = snapshot.enrollments.filter(
            (record) =>
                field(record, "groupId") === groupId &&
                field(record, "status") === "active",
        ).length;
        const plannedNewCount = plan.enrollments.filter(
            (enrollment) =>
                enrollment.groupKey === group.key &&
                !findMarked(
                    snapshot.enrollments,
                    marker("enrollment", enrollment.key),
                    enrollment.key,
                ),
        ).length;
        const capacity = Number(field(existingGroup, "capacity"));
        if (Number.isFinite(capacity) && activeCount + plannedNewCount > capacity) {
            throw new Error(`Group ${group.key} would exceed capacity; no writes were started.`);
        }
    }

    for (const invoice of plan.invoices) {
        const marked = findMarked(
            snapshot.invoices,
            marker("invoice", invoice.key),
            invoice.key,
        );
        if (marked) {
            if (field(marked, "status") === "void") {
                throw new Error(`Marked Invoice ${invoice.key} is void; no writes were started.`);
            }
            if (decimalCents(field(marked, "totalAmount")) !== decimalCents(invoice.expectedTotal)) {
                throw new Error(`Marked Invoice ${invoice.key} has a different total; no writes were started.`);
            }
        }
        const studentId = studentIds.get(invoice.studentKey);
        const enrollment = snapshot.enrollments.find((record) =>
            field(record, "notes").includes(marker("enrollment", invoice.enrollmentKey)),
        );
        const enrollmentId = enrollment ? recordId(enrollment) : undefined;
        if (!studentId || !enrollmentId) continue;
        const duplicate = snapshot.invoices.find(
            (record) =>
                field(record, "studentId") === studentId &&
                field(record, "enrollmentId") === enrollmentId &&
                field(record, "periodStart") === invoice.periodStart &&
                !field(record, "notes").includes(marker("invoice", invoice.key)),
        );
        if (duplicate) {
            throw new Error(`An unmarked Invoice already exists for ${invoice.key}; no writes were started.`);
        }
    }

    for (const session of plan.sessions) {
        const marked = findMarked(
            snapshot.sessions,
            marker("session", session.key),
            session.key,
        );
        if (marked) {
            const status = field(marked, "status");
            if (
                status === "cancelled" ||
                (session.past && status !== "scheduled" && status !== "completed")
            ) {
                throw new Error(`Marked Session ${session.key} has an incompatible status; no writes were started.`);
            }
            if (!session.past && status === "completed") {
                throw new Error(`Marked upcoming Session ${session.key} is already completed; no writes were started.`);
            }
            continue;
        }
        const groupId = groupIds.get(session.groupKey);
        if (!groupId) continue;
        const startsAt = new Date(session.startsAt).getTime();
        const endsAt = new Date(session.endsAt).getTime();
        const conflict = snapshot.sessions.find((record) => {
            const start = new Date(field(record, "startsAt")).getTime();
            const end = new Date(field(record, "endsAt")).getTime();
            return (
                Number.isFinite(start) &&
                Number.isFinite(end) &&
                start < endsAt &&
                end > startsAt
            );
        });
        if (conflict) {
            throw new Error(
                `A pre-existing session overlaps planned session ${session.key}; no writes were started.`,
            );
        }
    }

    const attendanceBySession = new Map<string, ApiRecord[]>();
    for (const attendanceItem of plan.attendance) {
        const session = findMarked(
            snapshot.sessions,
            marker("session", attendanceItem.sessionKey),
            attendanceItem.sessionKey,
        );
        const student = findMarked(
            snapshot.students,
            marker("student", attendanceItem.studentKey),
            attendanceItem.studentKey,
        );
        if (!session || !student) continue;
        const sessionId = recordId(session);
        let attendance = attendanceBySession.get(sessionId);
        if (!attendance) {
            attendance = dataFrom(
                await api.get<ApiEnvelope<ApiPage<ApiRecord>>>(
                    `${snapshot.root}/sessions/${sessionId}/attendance?page=1&pageSize=100`,
                ),
            ).items;
            attendanceBySession.set(sessionId, attendance);
        }
        const existing = attendance.find(
            (record) => field(record, "studentId") === recordId(student),
        );
        if (
            existing &&
            (field(existing, "notes") !== marker("attendance", attendanceItem.key) ||
                field(existing, "status") !== attendanceItem.status)
        ) {
            throw new Error(`Existing attendance conflicts with ${attendanceItem.key}; no writes were started.`);
        }
    }

    for (const payment of plan.payments) {
        const reference = marker("payment", payment.key);
        const existing = snapshot.payments.find(
            (record) => field(record, "reference") === reference,
        );
        if (!existing) continue;
        const student = findMarked(
            snapshot.students,
            marker("student", payment.studentKey),
            payment.studentKey,
        );
        if (
            !student ||
            field(existing, "studentId") !== recordId(student) ||
            decimalCents(field(existing, "amount")) !== decimalCents(payment.amount)
        ) {
            throw new Error(`Existing demo Payment does not match ${payment.key}; no writes were started.`);
        }
        const existingAllocations = dataFrom(
            await api.get<ApiEnvelope<ApiRecord[]>>(
                `${snapshot.root}/payments/${recordId(existing)}/allocations`,
            ),
        );
        const expected = new Map(
            payment.allocations.flatMap((allocation) => {
                const invoice = findMarked(
                    snapshot.invoices,
                    marker("invoice", allocation.invoiceKey),
                    allocation.invoiceKey,
                );
                return invoice
                    ? [[recordId(invoice), decimalCents(allocation.amount)] as const]
                    : [];
            }),
        );
        for (const allocation of existingAllocations) {
            const invoiceId = field(allocation, "invoiceId");
            const expectedAmount = expected.get(invoiceId);
            if (
                expectedAmount === undefined ||
                decimalCents(field(allocation, "amount")) !== expectedAmount
            ) {
                throw new Error(`Existing allocation differs for ${payment.key}; no writes were started.`);
            }
        }
    }
};

const plannedPaymentAmounts = (plan: SeedPlan) => {
    const invoiceTotal = plan.invoices.reduce(
        (sum, invoice) => sum + decimalCents(invoice.expectedTotal),
        0,
    );
    const allocatedTotal = plan.payments.reduce(
        (sum, payment) =>
            sum +
            payment.allocations.reduce(
                (allocationSum, allocation) =>
                    allocationSum + decimalCents(allocation.amount),
                0,
            ),
        0,
    );
    const paymentTotal = plan.payments.reduce(
        (sum, payment) => sum + decimalCents(payment.amount),
        0,
    );
    const unallocatedTotal = plan.payments
        .filter((payment) => payment.allocations.length === 0)
        .reduce((sum, payment) => sum + decimalCents(payment.amount), 0);
    if (paymentTotal !== allocatedTotal + unallocatedTotal) {
        throw new Error("Planned payment totals do not reconcile.");
    }
    return {
        invoiceTotal: centsDecimal(invoiceTotal),
        allocatedTotal: centsDecimal(allocatedTotal),
        outstandingTotal: centsDecimal(invoiceTotal - allocatedTotal),
        paymentTotal: centsDecimal(paymentTotal),
        unallocatedTotal: centsDecimal(unallocatedTotal),
    };
};

const printPreview = (
    plan: SeedPlan,
    snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
    teacherName: string,
    workspaceName: string,
    workspaceSlug: string,
): void => {
    const totals = plannedPaymentAmounts(plan);
    console.log("\nDRY-RUN PREVIEW — no records have been written.");
    console.log(`Teacher: ${teacherName} <${TARGET_EMAIL}>`);
    console.log(`Verified owned Workspace: ${workspaceName} (${workspaceSlug})`);
    console.log("Existing Workspace counts:");
    for (const [label, records] of Object.entries({
        Students: snapshot.students,
        Guardians: snapshot.guardians,
        Subjects: snapshot.subjects,
        Groups: snapshot.groups,
        Enrollments: snapshot.enrollments,
        "Sessions in seed date range": snapshot.sessions,
        Invoices: snapshot.invoices,
        Payments: snapshot.payments,
    })) {
        console.log(`  ${label}: ${records.length}`);
    }
    console.log("\nProposed records:");
    console.log(`  Subjects ${plan.subjects.length}: ${plan.subjects.map((item) => item.name).join("، ")}`);
    console.log(`  Students ${plan.students.length}:`);
    for (const student of plan.students) {
        console.log(`    ${student.name} — ${student.grade}, ${student.schoolName}, joined ${student.joinDate}`);
    }
    console.log(`  Guardians ${Math.min(12, plan.students.length)} with primary student links`);
    console.log("  Proposed Guardian links:");
    for (const [index, student] of plan.students.slice(0, 12).entries()) {
        console.log(`    ${student.name} ↔ ولي أمر ${student.name} (${index % 2 === 0 ? "father" : "mother"})`);
    }
    console.log(`  Study Groups ${plan.groups.length}:`);
    for (const group of plan.groups) {
        console.log(`    ${group.name} — ${group.weekdayName} ${String(group.hour).padStart(2, "0")}:00, fee EGP ${group.monthlyFee}, capacity ${group.capacity}`);
    }
    console.log(`  Active Enrollments ${plan.enrollments.length}:`);
    for (const enrollment of plan.enrollments) {
        console.log(`    ${enrollment.studentKey} → ${enrollment.groupKey}, enrolled ${enrollment.enrolledAt.slice(0, 10)}`);
    }
    console.log(`  Sessions ${plan.sessions.length}: ${plan.sessions.filter((item) => item.past).length} past, ${plan.sessions.filter((item) => !item.past).length} upcoming.`);
    for (const session of plan.sessions) {
        console.log(`    ${session.groupKey} ${session.date} ${session.past ? "completed" : "scheduled"} (${session.startsAt})`);
    }
    console.log(`  Attendance ${plan.attendance.length}: ${plan.attendance.filter((item) => item.status === "present").length} present, ${plan.attendance.filter((item) => item.status === "absent").length} absent, ${plan.attendance.filter((item) => item.status === "late").length} late, ${plan.attendance.filter((item) => item.status === "excused").length} excused.`);
    for (const item of plan.attendance) {
        console.log(`    ${item.sessionKey} / ${item.studentKey}: ${item.status}${item.lateMinutes ? ` ${item.lateMinutes} min` : ""}`);
    }
    console.log(`  Issued Invoices ${plan.invoices.length}: first September period is inclusive and prorated from each joining date; October is full-month.`);
    for (const invoice of plan.invoices) {
        console.log(`    ${invoice.studentKey} / ${invoice.groupKey} ${invoice.periodStart}..${invoice.periodEnd}: EGP ${invoice.expectedTotal}`);
    }
    console.log(`  Payments ${plan.payments.length}:`);
    for (const payment of plan.payments) {
        const targets = payment.allocations.length
            ? payment.allocations.map((item) => `${item.invoiceKey}=${item.amount}`).join(", ")
            : "unallocated";
        console.log(`    ${payment.key}: EGP ${payment.amount} (${payment.method}; ${targets})`);
    }
    console.log("Planned financial totals:");
    console.log(`  Invoice total: EGP ${totals.invoiceTotal}`);
    console.log(`  Allocated: EGP ${totals.allocatedTotal}`);
    console.log(`  Outstanding: EGP ${totals.outstandingTotal}`);
    console.log(`  Payments received: EGP ${totals.paymentTotal}`);
    console.log(`  Unallocated payments: EGP ${totals.unallocatedTotal}`);
    console.log("  Reconciliation: payment total = allocated + unallocated.");
}

const createCounts = (): Counts =>
({
    students: { created: 0, skipped: 0, updated: 0 },
    guardians: { created: 0, skipped: 0, updated: 0 },
    guardianLinks: { created: 0, skipped: 0, updated: 0 },
    subjects: { created: 0, skipped: 0, updated: 0 },
    groups: { created: 0, skipped: 0, updated: 0 },
    enrollments: { created: 0, skipped: 0, updated: 0 },
    sessions: { created: 0, skipped: 0, updated: 0 },
    attendance: { created: 0, skipped: 0, updated: 0 },
    invoices: { created: 0, skipped: 0, updated: 0 },
    payments: { created: 0, skipped: 0, updated: 0 },
    allocations: { created: 0, skipped: 0, updated: 0 },
});

const main = async (): Promise<void> => {
    const apply = process.argv.includes("--apply");
    const help = process.argv.includes("--help");
    if (help) {
        console.log("npx tsx scripts/seed-teacher-demo.ts [--dry-run | --apply]");
        console.log("Dry-run is the default. --apply requires the exact production confirmation prompt.");
        return;
    }
    if (process.argv.some((argument) => !["--apply", "--dry-run"].includes(argument) && argument !== process.argv[0] && argument !== process.argv[1])) {
        throw new Error("Unsupported option. Use --dry-run or --apply.");
    }
    if (apply && process.argv.includes("--dry-run")) {
        throw new Error("Choose either --dry-run or --apply.");
    }

    const password = await readHiddenInput("Teacher password (input hidden): ");
    const api = new ApiClient();
    await api.login(TARGET_EMAIL, password);
    
    const status = await api.get<{ user: ApiRecord }>("/auth/status");
    const user = status.user;
    const userId = field(user, "id");
    if (
        field(user, "email").toLowerCase() !== TARGET_EMAIL ||
        field(user, "status") !== "active" ||
        (user.capabilities as ApiRecord | undefined)?.teacher !== true
    ) {
        throw new Error("Authenticated identity is not the active target Teacher account.");
    }

    const workspacesEnvelope = await api.get<ApiEnvelope<ApiRecord[]>>("/workspaces/mine");
    const owned = workspacesEnvelope.data.filter(
        (workspace) => field(workspace, "ownerId") === userId,
    );
    if (owned.length !== 1) {
        throw new Error(`Expected exactly one owned Workspace; found ${owned.length}. No writes were started.`);
    }
    const workspace = owned[0];
    const workspaceId = recordId(workspace);
    const workspaceName = field(workspace, "name");
    const workspaceSlug = field(workspace, "slug");
    if (field(workspace, "status") !== "active") {
        throw new Error("The owned Workspace is not active. No writes were started.");
    }

    const plan = buildPlan();
    const snapshot = await loadSnapshot(api, workspaceId);
    await preflight(api, plan, snapshot);

    const dashboard = await api.get<ApiEnvelope<ApiRecord>>(
        `${snapshot.root}/dashboard/summary?timezone=${queryValue(WORKSPACE_TIME_ZONE)}`,
    );
    console.log(`\nAuthenticated target verified: ${TARGET_EMAIL}`);
    console.log(`Owned Workspace verified: ${workspaceName} (${workspaceSlug}); status active.`);
    const dashboardStudents = dashboard.data.students as ApiRecord | undefined;
    const dashboardGroups = dashboard.data.groups as ApiRecord | undefined;
    const dashboardFinance = dashboard.data.finance as ApiRecord | undefined;
    console.log(
        `Current dashboard: ${field(dashboardStudents ?? {}, "total")} students; ${field(dashboardGroups ?? {}, "total")} groups; current outstanding EGP ${field(dashboardFinance ?? {}, "currentOutstanding")}.`,
    );
    printPreview(plan, snapshot, field(user, "name"), workspaceName, workspaceSlug);

    if (!apply) {
        console.log("\nDry-run complete. No Production records were created, updated, or deleted.");
        return;
    }

    process.stdout.write(
        `\nType exactly "APPLY ${workspaceSlug}" to write demo records to this Production Workspace: `,
    );
    const confirmation = await readHiddenInput(
        `Confirmation (input hidden): APPLY ${workspaceSlug}\n`,
    );
    if (confirmation !== `APPLY ${workspaceSlug}`) {
        throw new Error("Production confirmation did not match. No writes were started.");
    }

    await applyPlan(api, snapshot, plan);
};

const applyPlan = async (
    api: ApiClient,
    snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
    plan: SeedPlan,
): Promise<void> => {
    const counts = createCounts();
    const createOrReuse = async (
        category: keyof Counts,
        collection: ApiRecord[],
        value: string,
        label: string,
        create: () => Promise<ApiRecord>,
    ): Promise<ApiRecord> => {
        const existing = findMarked(collection, value, label);
        if (existing) {
            counts[category].skipped += 1;
            return existing;
        }
        const created = await create();
        collection.push(created);
        counts[category].created += 1;
        return created;
    };

    const studentByKey = new Map<string, ApiRecord>();
    for (const student of plan.students) {
        const record = await createOrReuse(
            "students",
            snapshot.students,
            marker("student", student.key),
            student.key,
            async () =>
                dataFrom(
                    await api.post<ApiEnvelope<ApiRecord>>(
                        `${snapshot.root}/students`,
                        {
                            name: student.name,
                            email: `demo.${student.key}@example.test`,
                            phone: null,
                            schoolName: student.schoolName,
                            grade: student.grade,
                            status: "active",
                            notes: marker("student", student.key),
                        },
                    ),
                ),
        );
        studentByKey.set(student.key, record);
    }
    for (const [index, student] of students.slice(0, 12).entries()) {
        const key = `guardian-${String(index + 1).padStart(2, "0")}`;
        const value = marker("guardian", key);
        const guardian = await createOrReuse(
            "guardians",
            snapshot.guardians,
            value,
            key,
            async () =>
                dataFrom(
                    await api.post<ApiEnvelope<ApiRecord>>(
                        `${snapshot.root}/guardians`,
                        {
                            name: `ولي أمر ${student.name}`,
                            phone: `000000000${String(index + 1).padStart(2, "0")}`,
                            email: `demo.${key}@example.test`,
                            relationship: index % 2 === 0 ? "father" : "mother",
                            notes: `${value} — بيانات اتصال تجريبية غير حقيقية`,
                        },
                    ),
                ),
        );
        const studentRecord = studentByKey.get(student.key);
        if (!studentRecord) throw new Error("Student reference is missing.");
        const studentId = recordId(studentRecord);
        const guardianId = recordId(guardian);
        const links = dataFrom(
            await api.get<ApiEnvelope<ApiRecord[]>>(
                `${snapshot.root}/students/${studentId}/guardians`,
            ),
        );
        const existingLink = links.find(
            (link) =>
                isApiRecord(link.guardian) &&
                field(link.guardian, "id") === guardianId,
        );
        if (existingLink) {
            counts.guardianLinks.skipped += 1;
            continue;
        }
        const hasPrimary = links.some((link) => link.isPrimary === true);
        await api.post<ApiEnvelope<ApiRecord>>(
            `${snapshot.root}/students/${studentId}/guardians`,
            {
                guardianId,
                relationship: index % 2 === 0 ? "father" : "mother",
                isPrimary: !hasPrimary,
                receivesNotifications: true,
            },
        );
        counts.guardianLinks.created += 1;
    }

    const subjectByKey = new Map<string, ApiRecord>();
    for (const subject of plan.subjects) {
        const value = marker("subject", subject.key);
        const record = await createOrReuse(
            "subjects",
            snapshot.subjects,
            value,
            subject.key,
            async () =>
                dataFrom(
                    await api.post<ApiEnvelope<ApiRecord>>(
                        `${snapshot.root}/subjects`,
                        {
                            name: subject.name,
                            description: `${subject.description} ${value}`,
                        },
                    ),
                ),
        );
        subjectByKey.set(subject.key, record);
    }
    const groupByKey = new Map<string, ApiRecord>();
    for (const group of plan.groups) {
        const subject = subjectByKey.get(group.subjectKey);
        if (!subject) throw new Error("Subject reference is missing.");
        const value = marker("group", group.key);
        const record = await createOrReuse(
            "groups",
            snapshot.groups,
            value,
            group.key,
            async () =>
                dataFrom(
                    await api.post<ApiEnvelope<ApiRecord>>(
                        `${snapshot.root}/groups`,
                        {
                            subjectId: recordId(subject),
                            name: group.name,
                            description: `${group.description} ${value}`,
                            monthlyFee: group.monthlyFee,
                            capacity: group.capacity,
                        },
                    ),
                ),
        );
        groupByKey.set(group.key, record);
    }
    const enrollmentByKey = new Map<string, ApiRecord>();
    for (const enrollment of plan.enrollments) {
        const student = studentByKey.get(enrollment.studentKey);
        const group = groupByKey.get(enrollment.groupKey);
        if (!student || !group) throw new Error("Enrollment reference is missing.");
        const value = marker("enrollment", enrollment.key);
        const record = await createOrReuse(
            "enrollments",
            snapshot.enrollments,
            value,
            enrollment.key,
            async () =>
                dataFrom(
                    await api.post<ApiEnvelope<ApiRecord>>(
                        `${snapshot.root}/groups/${recordId(group)}/enrollments`,
                        {
                            studentId: recordId(student),
                            enrolledAt: enrollment.enrolledAt,
                            status: "active",
                            notes: value,
                        },
                    ),
                ),
        );
        enrollmentByKey.set(enrollment.key, record);
    }
    const sessionByKey = new Map<string, ApiRecord>();
    for (const session of plan.sessions) {
        const group = groupByKey.get(session.groupKey);
        if (!group) throw new Error("Session group reference is missing.");
        const value = marker("session", session.key);
        let record = findMarked(snapshot.sessions, value, session.key);
        if (!record) {
            record = dataFrom(
                await api.post<ApiEnvelope<ApiRecord>>(
                    `${snapshot.root}/sessions`,
                    {
                        groupId: recordId(group),
                        title: `${session.groupKey} — ${session.date}`,
                        startsAt: session.startsAt,
                        endsAt: session.endsAt,
                        notes: value,
                    },
                ),
            );
            snapshot.sessions.push(record);
            counts.sessions.created += 1;
        } else {
            counts.sessions.skipped += 1;
        }
        if (session.past && field(record, "status") === "scheduled") {
            record = dataFrom(
                await api.patch<ApiEnvelope<ApiRecord>>(
                    `${snapshot.root}/sessions/${recordId(record)}`,
                    { status: "completed" },
                ),
            );
            counts.sessions.updated += 1;
        }
        sessionByKey.set(session.key, record);
    }
    const attendanceBySession = new Map<string, ApiRecord[]>();
    for (const attendanceItem of plan.attendance) {
        const session = sessionByKey.get(attendanceItem.sessionKey);
        const student = studentByKey.get(attendanceItem.studentKey);
        if (!session || !student) throw new Error("Attendance reference is missing.");
        const sessionId = recordId(session);
        let sessionAttendance = attendanceBySession.get(sessionId);
        if (!sessionAttendance) {
            sessionAttendance = dataFrom(
                await api.get<ApiEnvelope<ApiPage<ApiRecord>>>(
                    `${snapshot.root}/sessions/${sessionId}/attendance?page=1&pageSize=100`,
                ),
            ).items;
            attendanceBySession.set(sessionId, sessionAttendance);
        }
        const existing = sessionAttendance.find(
            (record) => field(record, "studentId") === recordId(student),
        );
        if (existing) {
            counts.attendance.skipped += 1;
            continue;
        }
        await api.post<ApiEnvelope<ApiRecord>>(
            `${snapshot.root}/sessions/${sessionId}/attendance`,
            {
                studentId: recordId(student),
                status: attendanceItem.status,
                lateMinutes: attendanceItem.lateMinutes,
                notes: marker("attendance", attendanceItem.key),
            },
        );
        sessionAttendance.push({
            studentId: recordId(student),
            status: attendanceItem.status,
        });
        counts.attendance.created += 1;
    }

    const invoiceByKey = new Map<string, ApiRecord>();
    for (const invoice of plan.invoices) {
        const student = studentByKey.get(invoice.studentKey);
        const enrollment = enrollmentByKey.get(invoice.enrollmentKey);
        if (!student || !enrollment) throw new Error("Invoice reference is missing.");
        const value = marker("invoice", invoice.key);
        let record = findMarked(snapshot.invoices, value, invoice.key);
        if (!record) {
            record = dataFrom(
                await api.post<ApiEnvelope<ApiRecord>>(
                    `${snapshot.root}/invoices`,
                    {
                        studentId: recordId(student),
                        enrollmentId: recordId(enrollment),
                        periodStart: invoice.periodStart,
                        periodEnd: invoice.periodEnd,
                        description: `اشتراك شهري ${invoice.periodStart.slice(0, 7)}`,
                        notes: value,
                    },
                ),
            );
            snapshot.invoices.push(record);
            counts.invoices.created += 1;
        } else {
            counts.invoices.skipped += 1;
        }
        if (field(record, "status") === "draft") {
            record = dataFrom(
                await api.post<ApiEnvelope<ApiRecord>>(
                    `${snapshot.root}/invoices/${recordId(record)}/issue`,
                    {},
                ),
            );
            counts.invoices.updated += 1;
        }
        if (field(record, "status") !== "void") {
            invoiceByKey.set(invoice.key, record);
        }
    }
    const paymentByKey = new Map<string, ApiRecord>();
    for (const payment of plan.payments) {
        const student = studentByKey.get(payment.studentKey);
        if (!student) throw new Error("Payment Student reference is missing.");
        const reference = marker("payment", payment.key);
        const existing = snapshot.payments.find(
            (record) => field(record, "reference") === reference,
        );
        let record: ApiRecord;
        if (existing) {
            if (
                field(existing, "studentId") !== recordId(student) ||
                decimalCents(field(existing, "amount")) !== decimalCents(payment.amount)
            ) {
                throw new Error(`Existing demo Payment does not match ${payment.key}.`);
            }
            record = existing;
            counts.payments.skipped += 1;
        } else {
            record = dataFrom(
                await api.post<ApiEnvelope<ApiRecord>>(
                    `${snapshot.root}/payments`,
                    {
                        studentId: recordId(student),
                        amount: payment.amount,
                        method: payment.method,
                        receivedAt: payment.receivedAt,
                        reference,
                        notes: marker("payment-note", payment.key),
                    },
                ),
            );
            snapshot.payments.push(record);
            counts.payments.created += 1;
        }
        paymentByKey.set(payment.key, record);

        const existingAllocations = dataFrom(
            await api.get<ApiEnvelope<ApiRecord[]>>(
                `${snapshot.root}/payments/${recordId(record)}/allocations`,
            ),
        );
        for (const allocation of payment.allocations) {
            const invoice = invoiceByKey.get(allocation.invoiceKey);
            if (!invoice) continue;
            const invoiceId = recordId(invoice);
            const found = existingAllocations.find(
                (item) => field(item, "invoiceId") === invoiceId,
            );
            if (found) {
                if (decimalCents(field(found, "amount")) !== decimalCents(allocation.amount)) {
                    throw new Error(`Existing allocation differs for ${payment.key}.`);
                }
                counts.allocations.skipped += 1;
                continue;
            }
            await api.post<ApiEnvelope<ApiRecord>>(
                `${snapshot.root}/payments/${recordId(record)}/allocations`,
                { invoiceId, amount: allocation.amount },
            );
            counts.allocations.created += 1;
        }
    }
    const after = await loadSnapshot(api, recordIdFromPath(snapshot.root));
    verifyResult(after);
    console.log("\nSeed operation totals:");
    for (const [name, result] of Object.entries(counts)) {
        console.log(`  ${name}: created ${result.created}, skipped ${result.skipped}, updated ${result.updated}`);
    }
    console.log("Post-write API verification passed: scoped references, capacities, and financial DTO balances.");
};

const recordIdFromPath = (root: string): string => decodeURIComponent(root.slice("/workspaces/".length));

const verifyResult = (
    snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
): void => {
    const allStudents = new Set(snapshot.students.map(recordId));
    const allGroups = new Set(snapshot.groups.map(recordId));
    const allSubjects = new Set(snapshot.subjects.map(recordId));
    const activePairs = new Set<string>();
    const activeByGroup = new Map<string, number>();

    for (const subject of snapshot.subjects) {
        if (!field(subject, "id") && !field(subject, "_id")) {
            throw new Error("Subject DTO is missing its ID.");
        }
    }
    for (const group of snapshot.groups) {
        if (!allSubjects.has(field(group, "subjectId"))) {
            throw new Error("Found a Group whose Subject is outside the Workspace.");
        }
    }
    for (const enrollment of snapshot.enrollments) {
        const studentId = field(enrollment, "studentId");
        const groupId = field(enrollment, "groupId");
        if (!allStudents.has(studentId) || !allGroups.has(groupId)) {
            throw new Error("Found an Enrollment with a broken Workspace reference.");
        }
        if (field(enrollment, "status") === "active") {
            const pair = `${studentId}:${groupId}`;
            if (activePairs.has(pair)) throw new Error("Duplicate active Enrollment found.");
            activePairs.add(pair);
            activeByGroup.set(groupId, (activeByGroup.get(groupId) ?? 0) + 1);
        }
    }
    for (const group of snapshot.groups) {
        const capacity = group.capacity;
        const activeCount = activeByGroup.get(recordId(group)) ?? 0;
        if (typeof capacity === "number" && activeCount > capacity) {
            throw new Error("A Group exceeds its configured capacity.");
        }
    }

    for (const invoice of snapshot.invoices) {
        const total = decimalCents(field(invoice, "totalAmount"));
        const allocated = decimalCents(field(invoice, "allocatedAmount"));
        const outstanding = decimalCents(field(invoice, "outstandingAmount"));
        if (field(invoice, "status") === "issued" && total !== allocated + outstanding) {
            throw new Error("Invoice financial DTO totals do not reconcile.");
        }
        if (
            !allStudents.has(field(invoice, "studentId")) ||
            !snapshot.enrollments.some(
                (enrollment) =>
                    recordId(enrollment) === field(invoice, "enrollmentId") &&
                    field(enrollment, "studentId") === field(invoice, "studentId") &&
                    field(enrollment, "groupId") === field(invoice, "groupId"),
            )
        ) {
            throw new Error("Found an Invoice with a broken Workspace reference.");
        }
    }
    for (const payment of snapshot.payments) {
        const amount = decimalCents(field(payment, "amount"));
        const allocated = decimalCents(field(payment, "allocatedAmount"));
        const unallocated = decimalCents(field(payment, "unallocatedAmount"));
        if (amount !== allocated + unallocated) {
            throw new Error("Payment financial DTO totals do not reconcile.");
        }
        if (!allStudents.has(field(payment, "studentId"))) {
            throw new Error("Found a Payment with a Student outside the Workspace.");
        }
    }
};

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Seed script failed.";
    console.error(`Seed stopped: ${message}`);
    process.exitCode = 1;
});
