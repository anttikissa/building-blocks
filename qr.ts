// QR codes (ISO/IEC 18004), byte mode, error correction level M: text in, a square of dark (true) and
// light modules out. Self-contained, so any project can copy it. Follows Project Nayuki's QR generator.

// Error correction codewords per block and the number of blocks, by version, for level M.
const eccPerBlock = [
	0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28,
	28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
]
const blockCount = [
	0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33,
	35, 37, 38, 40, 43, 45, 47, 49,
]

const rawModules = (v: number) => {
	let n = (16 * v + 128) * v + 64
	if (v >= 2) {
		const align = Math.floor(v / 7) + 2
		n -= (25 * align - 10) * align - 55
		if (v >= 7) n -= 36
	}
	return n
}
const dataCodewords = (v: number) => Math.floor(rawModules(v) / 8) - eccPerBlock[v]! * blockCount[v]!

// Multiplication in GF(2^8) with the polynomial 0x11d.
function mul(x: number, y: number) {
	let z = 0
	for (let i = 7; i >= 0; i--) {
		z = (z << 1) ^ ((z >>> 7) * 0x11d)
		z ^= ((y >>> i) & 1) * x
	}
	return z
}

function reedSolomon(data: number[], degree: number) {
	const divisor = Array<number>(degree).fill(0)
	divisor[degree - 1] = 1
	let root = 1
	for (let i = 0; i < degree; i++) {
		for (let j = 0; j < degree; j++) {
			divisor[j] = mul(divisor[j]!, root)
			if (j + 1 < degree) divisor[j]! ^= divisor[j + 1]!
		}
		root = mul(root, 2)
	}
	const rest = Array<number>(degree).fill(0)
	for (const b of data) {
		const factor = b ^ rest.shift()!
		rest.push(0)
		divisor.forEach((d, i) => (rest[i]! ^= mul(d, factor)))
	}
	return rest
}

// The data codewords split into blocks, each with its error correction, interleaved.
function codewords(data: number[], v: number) {
	const count = blockCount[v]!
	const ecc = eccPerBlock[v]!
	const raw = Math.floor(rawModules(v) / 8)
	const short = count - (raw % count)
	const shortLength = Math.floor(raw / count)
	const blocks: number[][] = []
	for (let i = 0, k = 0; i < count; i++) {
		const block = data.slice(k, k + shortLength - ecc + (i < short ? 0 : 1))
		k += block.length
		const check = reedSolomon(block, ecc)
		if (i < short) block.push(0)
		blocks.push([...block, ...check])
	}
	const out: number[] = []
	for (let i = 0; i < blocks[0]!.length; i++)
		blocks.forEach((b, j) => {
			if (i !== shortLength - ecc || j >= short) out.push(b[i]!)
		})
	return out
}

function alignment(v: number, size: number) {
	if (v === 1) return []
	const count = Math.floor(v / 7) + 2
	const step = Math.floor((v * 8 + count * 3 + 5) / (count * 4 - 4)) * 2
	const at = [6]
	for (let p = size - 7; at.length < count; p -= step) at.splice(1, 0, p)
	return at
}

const masks: ((x: number, y: number) => boolean)[] = [
	(x, y) => (x + y) % 2 === 0,
	(_, y) => y % 2 === 0,
	(x) => x % 3 === 0,
	(x, y) => (x + y) % 3 === 0,
	(x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
	(x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
	(x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
	(x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

// The 4 penalty rules of the standard: the mask with the lowest score reads most reliably.
function penalty(m: boolean[][]) {
	const size = m.length
	const lines = [
		...m.map((row) => row.map(Number).join('')),
		...m.map((_, x) => m.map((row) => Number(row[x])).join('')),
	]
	let score = 0
	for (const line of lines) {
		for (const run of line.match(/0{5,}|1{5,}/g) ?? []) score += run.length - 2
		for (const p of [/(?=10111010000)/g, /(?=00001011101)/g]) score += 40 * (line.match(p)?.length ?? 0)
	}
	for (let y = 0; y < size - 1; y++)
		for (let x = 0; x < size - 1; x++) {
			const c = m[y]![x]
			if (c === m[y]![x + 1] && c === m[y + 1]![x] && c === m[y + 1]![x + 1]) score += 3
		}
	const dark = m.flat().filter(Boolean).length
	const total = size * size
	return score + (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10
}

export function qr(text: string, mask?: number): boolean[][] {
	const bytes = new TextEncoder().encode(text)
	let v = 1
	const bitsFor = (v: number) => 4 + (v < 10 ? 8 : 16) + bytes.length * 8
	while (bitsFor(v) > dataCodewords(v) * 8) if (++v > 40) throw new Error('Too long for a QR code.')

	const bits: number[] = []
	const put = (value: number, n: number) => {
		for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1)
	}
	put(4, 4)
	put(bytes.length, v < 10 ? 8 : 16)
	for (const b of bytes) put(b, 8)
	const capacity = dataCodewords(v) * 8
	put(0, Math.min(4, capacity - bits.length))
	put(0, (8 - (bits.length % 8)) % 8)
	for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8)
	const data: number[] = []
	for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2))

	const size = v * 4 + 17
	const m = Array.from({ length: size }, () => Array<boolean>(size).fill(false))
	const fixed = Array.from({ length: size }, () => Array<boolean>(size).fill(false))
	const set = (x: number, y: number, dark: boolean) => {
		m[y]![x] = dark
		fixed[y]![x] = true
	}

	for (let i = 0; i < size; i++) {
		set(6, i, i % 2 === 0)
		set(i, 6, i % 2 === 0)
	}
	for (const [cx, cy] of [
		[3, 3],
		[size - 4, 3],
		[3, size - 4],
	] as const)
		for (let dy = -4; dy <= 4; dy++)
			for (let dx = -4; dx <= 4; dx++) {
				const d = Math.max(Math.abs(dx), Math.abs(dy))
				const x = cx + dx
				const y = cy + dy
				if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4)
			}
	const at = alignment(v, size)
	at.forEach((cy, i) =>
		at.forEach((cx, j) => {
			const last = at.length - 1
			if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return
			for (let dy = -2; dy <= 2; dy++)
				for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
		}),
	)
	const format = (mask: number) => {
		let rest = mask
		for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537)
		const f = ((mask << 10) | rest) ^ 0x5412
		const bit = (i: number) => ((f >>> i) & 1) === 1
		for (let i = 0; i <= 5; i++) set(8, i, bit(i))
		set(8, 7, bit(6))
		set(8, 8, bit(7))
		set(7, 8, bit(8))
		for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i))
		for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i))
		for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i))
		set(8, size - 8, true)
	}
	format(0)
	if (v >= 7) {
		let rest = v
		for (let i = 0; i < 12; i++) rest = (rest << 1) ^ ((rest >>> 11) * 0x1f25)
		const f = (v << 12) | rest
		for (let i = 0; i < 18; i++) {
			const dark = ((f >>> i) & 1) === 1
			const a = size - 11 + (i % 3)
			const b = Math.floor(i / 3)
			set(a, b, dark)
			set(b, a, dark)
		}
	}

	const all = codewords(data, v)
	let i = 0
	for (let right = size - 1; right >= 1; right -= 2) {
		if (right === 6) right = 5
		for (let n = 0; n < size; n++)
			for (let j = 0; j < 2; j++) {
				const x = right - j
				const y = ((right + 1) & 2) === 0 ? size - 1 - n : n
				if (fixed[y]![x] || i >= all.length * 8) continue
				m[y]![x] = ((all[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1
				i++
			}
	}

	const apply = (k: number) => {
		for (let y = 0; y < size; y++)
			for (let x = 0; x < size; x++) if (!fixed[y]![x] && masks[k]!(x, y)) m[y]![x] = !m[y]![x]
		format(k)
	}
	let best = mask ?? 0
	if (mask === undefined) {
		let lowest = Infinity
		for (let k = 0; k < 8; k++) {
			apply(k)
			const p = penalty(m)
			if (p < lowest) [lowest, best] = [p, k]
			apply(k)
		}
	}
	apply(best)
	return m
}

// An SVG path of the dark modules, one unit each, for a viewBox of the size plus a 4-module margin.
export function qrPath(m: boolean[][]) {
	return m.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x + 4} ${y + 4}h1v1h-1z`] : []))).join('')
}
