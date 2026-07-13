const DUCKDUCKGO_LITE_URL = "https://lite.duckduckgo.com/lite";
const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
	let lastError: Error | undefined;
	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			if (attempt < MAX_RETRIES) {
				const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
				await new Promise((r) => setTimeout(r, delay));
			}
		}
	}
	throw new Error(`${label} failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

export interface SearchResult {
	title: string;
	snippet: string;
	url: string;
}

function decodeHtmlEntities(text: string): string {
	return text
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x27;/g, "'")
		.replace(/&#x2F;/g, "/")
		.replace(/&nbsp;/g, " ")
		.replace(/&apos;/g, "'")
		.replace(/&rsquo;/g, "\u2019")
		.replace(/&lsquo;/g, "\u2018")
		.replace(/&rdquo;/g, "\u201D")
		.replace(/&ldquo;/g, "\u201C")
		.replace(/&mdash;/g, "\u2014")
		.replace(/&ndash;/g, "\u2013")
		.replace(/&hellip;/g, "\u2026")
		.replace(/&copy;/g, "\u00A9")
		.replace(/&reg;/g, "\u00AE")
		.replace(/&trade;/g, "\u2122")
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function extractTagContent(html: string, tag: string): string {
	const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
	const match = html.match(regex);
	return match ? decodeHtmlEntities(match[1].replace(/<[^>]+>/g, "").trim()) : "";
}

function parseLiteResults(html: string): SearchResult[] {
	const results: SearchResult[] = [];
	const seen = new Set<string>();

	// Strategy 1: DDG Lite specific - result-link class
	const resultLinks = [
		...html.matchAll(/<a[^>]+rel="nofollow"[^>]+href="([^"]+)"[^>]*class="result-link"[^>]*>([\s\S]*?)<\/a>/gi),
	];

	for (const linkMatch of resultLinks) {
		const url = linkMatch[1].trim();
		const titleHtml = linkMatch[2];
		const title = decodeHtmlEntities(titleHtml.replace(/<[^>]+>/g, "").trim());

		if (!title || !url || seen.has(url)) continue;
		seen.add(url);

		const linkIndex = html.indexOf(linkMatch[0]);
		if (linkIndex === -1) continue;

		const afterLink = html.slice(linkIndex + linkMatch[0].length, linkIndex + linkMatch[0].length + 2000);
		const snippet = extractTagContent(afterLink, "td");

		results.push({ title, snippet: snippet || "", url });
	}

	// Strategy 2: DDG Lite fallback - tr blocks
	if (results.length === 0) {
		const trBlocks = [...html.matchAll(/<tr[^>]*class="[\s]*"[^>]*>([\s\S]*?)<\/tr>/gi)];
		for (const tr of trBlocks) {
			const block = tr[1];
			const linkMatch = block.match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
			if (!linkMatch) continue;

			const url = linkMatch[1].trim();
			const title = decodeHtmlEntities(linkMatch[2].replace(/<[^>]+>/g, "").trim());
			const snippet = extractTagContent(block, "td");

			if (title && url && !url.includes("duckduckgo.com") && !seen.has(url)) {
				seen.add(url);
				results.push({ title, snippet: snippet || "", url });
			}
		}
	}

	// Strategy 3: Generic fallback - any external links
	if (results.length === 0) {
		const allLinks = [...html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
		for (const linkMatch of allLinks) {
			const url = linkMatch[1].trim();
			const title = decodeHtmlEntities(linkMatch[2].replace(/<[^>]+>/g, "").trim());

			if (!title || !url || url.includes("duckduckgo.com") || seen.has(url)) continue;
			seen.add(url);
			results.push({ title, snippet: "", url });
		}
	}

	return results;
}

export async function searchWeb(query: string, maxResults: number = 10): Promise<SearchResult[]> {
	return withRetry(async () => {
		const formData = new URLSearchParams();
		formData.append("q", query);
		formData.append("kl", "wt-wt");

		const response = await fetch(DUCKDUCKGO_LITE_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				"User-Agent": USER_AGENT,
			},
			body: formData.toString(),
			signal: AbortSignal.timeout(15000),
		});

		if (!response.ok) {
			throw new Error(`Search request failed: ${response.status} ${response.statusText}`);
		}

		const html = await response.text();
		const results = parseLiteResults(html);
		return results.slice(0, maxResults);
	}, "web_search");
}

export async function fetchUrl(url: string): Promise<{ content: string; contentType: string }> {
	const parsed = new URL(url);
	const hostname = parsed.hostname.toLowerCase();
	const localPatterns = [
		/^localhost$/i,
		/^127\./,
		/^10\./,
		/^172\.(1[6-9]|2\d|3[01])\./,
		/^192\.168\./,
		/^0\./,
		/^\[::1\]$/,
		/^::1$/,
	];
	if (localPatterns.some((p) => p.test(hostname))) {
		throw new Error("Requests to local/internal addresses are not allowed");
	}

	return withRetry(async () => {
		const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
		const response = await fetch(url, {
			headers: {
				"User-Agent": USER_AGENT,
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			},
			signal: AbortSignal.timeout(15000),
			redirect: "follow",
		});

		if (!response.ok) {
			throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
		}

		const contentType = response.headers.get("content-type") ?? "text/html";
		const contentLength = Number(response.headers.get("content-length"));
		if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
			throw new Error(`Response too large: ${contentLength} bytes (max ${MAX_RESPONSE_BYTES})`);
		}

		const text = await response.text();
		if (new TextEncoder().encode(text).length > MAX_RESPONSE_BYTES) {
			throw new Error(`Response too large (max ${MAX_RESPONSE_BYTES} bytes)`);
		}

		if (contentType.includes("text/html")) {
			const cleaned = text
				.replace(/<script[\s\S]*?<\/script>/gi, "")
				.replace(/<style[\s\S]*?<\/style>/gi, "")
				.replace(/<nav[\s\S]*?<\/nav>/gi, "")
				.replace(/<header[\s\S]*?<\/header>/gi, "")
				.replace(/<footer[\s\S]*?<\/footer>/gi, "")
				.replace(/<aside[\s\S]*?<\/aside>/gi, "")
				.replace(/<[^>]+>/g, " ")
				.replace(/\s+/g, " ")
				.trim();
			return { content: cleaned, contentType: "text/html" };
		}

		return { content: text, contentType };
	}, "web_fetch");
}
