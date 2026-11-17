import { expect, test } from 'bun:test'
import { v, type Infer } from './validate'

const Env = v.object({
	PORT: v.int().min(1).max(65535).default(4710),
	RATIO: v.number(),
	NAME: v.string().optional(),
	ADMIN: v.email(),
	DEBUG: v.boolean().default(false),
	MODE: v.oneOf('dev', 'prod'),
	HOME: v.url(),
	TAGS: v.array(v.string().min(1)).optional(),
	DB: v.object({ path: v.string() }).optional(),
})

test('converts strings from env files and URLs, applies defaults and drops unknown keys', () => {
	const env: Infer<typeof Env> = Env.parse({
		RATIO: '0.5',
		NAME: '',
		ADMIN: 'a@example.com',
		DEBUG: '1',
		MODE: 'prod',
		HOME: 'https://example.com/',
		SECRET: 'x',
	})
	expect(env).toEqual({
		PORT: 4710,
		RATIO: 0.5,
		NAME: undefined,
		ADMIN: 'a@example.com',
		DEBUG: true,
		MODE: 'prod',
		HOME: 'https://example.com/',
		TAGS: undefined,
		DB: undefined,
	})
	expect(v.object({ page: v.int(), q: v.string() }).parse(new URLSearchParams('page=2&q=hi'))).toEqual({
		page: 2,
		q: 'hi',
	})
	expect(v.object({ on: v.boolean() }).parse({ on: false })).toEqual({ on: false })
})

test('lists every bad field by path and never quotes values', () => {
	const error = (() => {
		try {
			Env.parse({
				PORT: '70000',
				RATIO: 'abc',
				ADMIN: 'hunter2',
				DEBUG: 'yes',
				MODE: 'test',
				HOME: 'not a url',
				TAGS: ['a', ''],
				DB: { path: 3 },
			})
		} catch (e) {
			return (e as Error).message
		}
	})()
	expect(error).toBe(
		[
			'PORT: must be at most 65535',
			'RATIO: expected a number',
			'ADMIN: expected an email address',
			'DEBUG: expected true or false',
			'MODE: expected one of dev, prod',
			'HOME: expected a URL',
			'TAGS[1]: required',
			'DB.path: expected a string',
		].join('\n'),
	)
	expect(() => Env.parse(undefined)).toThrow('value: required')
	expect(() => v.int().parse('1.5')).toThrow('value: expected an integer')
	expect(() => v.number().parse(' ')).toThrow('value: expected a number')
	expect(() => v.email().parse(`${'a'.repeat(250)}@b.cc`)).toThrow('value: must be at most 254')
})
