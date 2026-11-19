// Parses untrusted input into typed values: env and config files, URL parameters, request bodies.
// Env files and URLs hold only strings, so numbers and booleans also accept their string forms, and
// an empty string or null counts as missing. parse() throws a ValidationError whose
// issues name each bad field, so a server can send them and a form can show each under its field.
// Every type and rule takes an optional message. Messages never quote values: they may be secrets.
//
//   const Login = v.object({
//   	email: v.email('Check the email address.').transform((s) => s.toLowerCase()),
//   	password: v.string('Type a password.').min(8, 'Use at least 8 characters.'),
//   })
//   const login = Login.parse(body)   // also takes URLSearchParams
//   type Login = Infer<typeof Login>

export type Issue = {
	path: string
	code: 'required' | 'type' | 'min' | 'max' | 'custom'
	limit?: number
	message: string
}

export class ValidationError extends Error {
	constructor(readonly issues: Issue[]) {
		super(issues.map((i) => `${i.path || 'value'}: ${i.message}`).join('\n'))
	}
}

type Check<T> = (value: unknown, path: string, issues: Issue[]) => T

export class Schema<T> {
	constructor(readonly check: Check<T>) {}

	parse(input: unknown): T {
		const issues: Issue[] = []
		const value = this.check(input, '', issues)
		if (issues.length) throw new ValidationError(issues)
		return value
	}

	// Converts a valid value; later rules see the result.
	transform<U>(convert: (value: T) => U): Schema<U> {
		return new Schema((value, path, issues) => {
			const before = issues.length
			const result = this.check(value, path, issues)
			return issues.length === before ? convert(result) : (result as unknown as U)
		})
	}

	refine(
		ok: (value: T) => boolean,
		message: string | ((value: T) => string),
		code: Issue['code'] = 'custom',
		limit?: number,
	) {
		return new Schema((value, path, issues) => {
			const before = issues.length
			const result = this.check(value, path, issues)
			if (issues.length === before && !ok(result))
				issues.push({
					path,
					code,
					...(limit === undefined ? {} : { limit }),
					message: typeof message === 'string' ? message : message(result),
				})
			return result
		})
	}

	// A number's value; a string's or an array's length.
	min(n: number, message?: string) {
		return this.refine((x) => size(x) >= n, message ?? ((x) => limit('at least', n, x)), 'min', n)
	}

	max(n: number, message?: string) {
		return this.refine((x) => size(x) <= n, message ?? ((x) => limit('at most', n, x)), 'max', n)
	}

	optional(): Schema<T | undefined> {
		return new Schema((value, path, issues) => (missing(value) ? undefined : this.check(value, path, issues)))
	}

	nullable(): Schema<T | null> {
		return new Schema((value, path, issues) => (missing(value) ? null : this.check(value, path, issues)))
	}

	default(fallback: T): Schema<T> {
		return new Schema((value, path, issues) => (missing(value) ? fallback : this.check(value, path, issues)))
	}
}

export type Infer<S> = S extends Schema<infer T> ? T : never

// JSON clients send null for an empty field; env files and forms send ''.
const missing = (x: unknown) => x === undefined || x === null || x === ''
const size = (x: unknown) => (typeof x === 'number' ? x : (x as { length: number }).length)
const limit = (bound: string, n: number, x: unknown) =>
	typeof x === 'number'
		? `must be ${bound} ${n}`
		: `must have ${bound} ${n} ${typeof x === 'string' ? 'character' : 'item'}${n === 1 ? '' : 's'}`
const num = (x: unknown) => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x) : NaN)

// Records why `value` is unusable and returns nothing; callers pass the result on as T.
function fail(value: unknown, path: string, issues: Issue[], expected: string, message?: string): never {
	const code = missing(value) ? 'required' : 'type'
	issues.push({ path, code, message: message ?? (code === 'required' ? 'required' : `expected ${expected}`) })
	return undefined as never
}

// A schema that converts a value, or returns undefined if it cannot.
function scalar<T>(expected: string, convert: (x: unknown) => T | undefined, message?: string): Schema<T> {
	return new Schema((value, path, issues) => {
		const result = missing(value) ? undefined : convert(value)
		return result === undefined ? fail(value, path, issues, expected, message) : result
	})
}

const text = (x: unknown) => (typeof x === 'string' ? x : undefined)
const number = (x: unknown) => (Number.isFinite(num(x)) ? num(x) : undefined)
const int = (x: unknown) => (Number.isSafeInteger(num(x)) ? num(x) : undefined)
const bool = (x: unknown) =>
	x === true || x === 'true' || x === '1' ? true : x === false || x === 'false' || x === '0' ? false : undefined
// Looks like an address: no spaces, one @, a dot in the domain.
const email = (x: unknown) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(x) ?? '') ? text(x) : undefined)
const url = (x: unknown) => (URL.canParse(text(x) ?? '') ? text(x) : undefined)

function array<T>(item: Schema<T>, message?: string): Schema<T[]> {
	return new Schema((value, path, issues) =>
		Array.isArray(value)
			? value.map((x, i) => item.check(x, `${path}[${i}]`, issues))
			: fail(value, path, issues, 'an array', message),
	)
}

// Keeps only the keys in `shape`.
function object<S extends Record<string, Schema<unknown>>>(
	shape: S,
	message?: string,
): Schema<{ [K in keyof S]: Infer<S[K]> }> {
	return new Schema((value, path, issues) => {
		if (value instanceof URLSearchParams) value = Object.fromEntries(value)
		if (!value || typeof value !== 'object' || Array.isArray(value))
			return fail(value, path, issues, 'an object', message)
		const out: Record<string, unknown> = {}
		for (const key in shape)
			out[key] = shape[key]!.check((value as Record<string, unknown>)[key], path ? `${path}.${key}` : key, issues)
		return out as { [K in keyof S]: Infer<S[K]> }
	})
}

// The first option that accepts the value wins.
function union<const S extends Schema<unknown>[]>(options: S, message?: string): Schema<Infer<S[number]>> {
	return new Schema((value, path, issues) => {
		for (const option of options) {
			const own: Issue[] = []
			const result = option.check(value, path, own)
			if (!own.length) return result as Infer<S[number]>
		}
		return fail(value, path, issues, 'a valid value', message)
	})
}

export const v = {
	string: (message?: string) => scalar('a string', text, message),
	number: (message?: string) => scalar('a number', number, message),
	int: (message?: string) => scalar('an integer', int, message),
	boolean: (message?: string) => scalar('true or false', bool, message),
	email: (message?: string) => scalar('an email address', email, message).max(254, message),
	url: (message?: string) => scalar('a URL', url, message),
	oneOf: <const T extends string[]>(values: T, message?: string) =>
		scalar(
			`one of ${values.join(', ')}`,
			(x) => (values.includes(x as string) ? (x as T[number]) : undefined),
			message,
		),
	array,
	object,
	union,
}
