export function getMinicodeUserAgent(version: string): string {
	const runtime = process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`;
	return `minicode/${version} (${process.platform}; ${runtime}; ${process.arch})`;
}
