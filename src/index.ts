import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import puppeteer, { Browser } from "@cloudflare/puppeteer";
import { env } from 'cloudflare:workers'

function getEnv<Env>() {
	return env as Env
}

const env2 = getEnv<Env>()
console.log(`env2: ${JSON.stringify(env2)}`)

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Website Assistant",
		version: "1.0.0",
	});

	private browser: Browser | null = null;
	private lastBrowserInit: number = 0;
	private readonly BROWSER_TIMEOUT = 5 * 60 * 1000; // 5 minutes
	private initPromise: Promise<void> | null = null;
	private isInitializing = false;

	async init() {
		// If already initializing, wait for the current initialization to complete
		if (this.isInitializing) {
			console.log('Browser initialization in progress, waiting...');
			await this.initPromise;
			return;
		}

		// Check if we need to reinitialize the browser
		const now = Date.now();
		if (this.browser && (now - this.lastBrowserInit) < this.BROWSER_TIMEOUT) {
			console.log('Using existing browser instance');
			return;
		}

		this.isInitializing = true;
		this.initPromise = (async () => {
			try {
				console.log('Starting browser initialization...');
				
				// Close existing browser if it exists
				if (this.browser) {
					console.log('Closing existing browser instance');
					await this.browser.close();
					this.browser = null;
				}

				// Properly initialize the browser binding
				const browserBinding = (env as any).BROWSER;
				if (!browserBinding) {
					throw new Error('BROWSER binding not found in environment');
				}

				// Create a new browser instance using the binding
				this.browser = await puppeteer.launch(browserBinding);
				this.lastBrowserInit = now;
				console.log('Browser launched successfully');
			} catch (error: unknown) {
				console.error('Browser initialization failed:', error instanceof Error ? error.message : 'Unknown error');
				if (error instanceof Error) {
					console.error('Error stack:', error.stack);
				}
				this.browser = null;
			} finally {
				this.isInitializing = false;
				this.initPromise = null;
			}
		})();

		await this.initPromise;
	}

	async cleanup() {
		if (this.browser) {
			try {
				console.log('Cleaning up browser instance');
				await this.browser.close();
				this.browser = null;
				this.lastBrowserInit = 0;
			} catch (error) {
				console.error('Error during browser cleanup:', error);
			}
		}
	}

	constructor(state: DurableObjectState) {
		super(state, {
			server: new McpServer({
				name: "Website Assistant",
				version: "1.0.0",
			})
		});
		this.initializeTools();
	}

	private initializeTools() {
		// Website analysis tool
		this.server.tool(
			"analyze_website",
			{
				url: z.string().url(),
			},
			async ({ url }: { url: string }) => {
				try {
					// Ensure browser is initialized
					await this.init();

					if (!this.browser) {
						console.error('Browser state:', {
							browserExists: !!this.browser,
							envHasBrowser: !!(env as any).BROWSER
						});
						return {
							content: [{
								type: "text",
								text: "Error: Browser functionality is not available. This could be due to:\n1. Missing BROWSER binding in your Cloudflare Workers configuration\n2. Insufficient permissions to use the browser binding\n3. Browser initialization failed\n\nPlease check your wrangler.jsonc configuration and ensure you have the necessary permissions.",
							}],
						};
					}

					console.log('Creating new page for URL:', url);
					const page = await this.browser.newPage();
					
					// Set basic headers
					await page.setExtraHTTPHeaders({
						'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
					});

					// Handle page errors
					page.on('error', err => {
						console.error('Page error:', err);
					});

					// Set a longer timeout and add retry logic
					const maxRetries = 3;
					let retryCount = 0;
					let lastError: Error | null = null;
					let response: any = null;

					while (retryCount < maxRetries) {
						try {
							console.log(`Attempt ${retryCount + 1} to navigate to ${url}`);
							response = await page.goto(url, {
								waitUntil: 'load',
								timeout: 30000 // 30 seconds timeout
							});
							
							// Check response status
							if (response?.status() === 502) {
								throw new Error('Website returned 502 Bad Gateway error');
							}
							
							console.log('Successfully navigated to page');
							break;
						} catch (error) {
							lastError = error as Error;
							console.error(`Navigation attempt ${retryCount + 1} failed:`, error);
							retryCount++;
							if (retryCount < maxRetries) {
								console.log('Retrying in 2 seconds...');
								await new Promise(resolve => setTimeout(resolve, 2000));
							}
						}
					}

					if (retryCount === maxRetries) {
						return {
							content: [{
								type: "text",
								text: `Unable to access the website. This could be due to:\n1. The website is blocking requests from Cloudflare\n2. The website is experiencing technical issues\n3. Network connectivity problems\n\nError details: ${lastError?.message}`
							}],
						};
					}

					// Extract page content
					const pageContent = await page.evaluate(() => {
						// Check if we're on an error page
						const errorText = document.body.innerText;
						if (errorText.includes('502') || errorText.includes('Bad Gateway')) {
							return {
								isError: true,
								errorText: errorText
							};
						}

						return {
							isError: false,
							title: document.title,
							description: document.querySelector('meta[name="description"]')?.getAttribute('content'),
							content: document.body.innerText.trim()
						};
					});

					await page.close();

					if (pageContent.isError) {
						return {
							content: [{
								type: "text",
								text: `The website appears to be experiencing technical issues:\n\n${pageContent.errorText}`
							}],
						};
					}

					// Use Cloudflare AI to analyze the content
					const messages = [
						{ 
							role: "system", 
							content: "You are a website content analyzer. Analyze the given website content and provide a concise summary of what the website is about, its main topics, and key information." 
						},
						{
							role: "user",
							content: `Website Title: ${pageContent.title}\nDescription: ${pageContent.description || 'No description'}\nContent: ${pageContent.content?.slice(0, 2000) || 'No content available'}`
						}
					];

					const analysis = await (env as any).AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", { messages });

					return {
						content: [{
							type: "text",
							text: analysis.response || "Unable to analyze website content."
						}],
					};
				} catch (error) {
					console.error('Error analyzing website:', error);
					return {
						content: [{
							type: "text",
							text: `Error analyzing website: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
						}],
					};
				}
			}
		);

		// Question about website tool
		this.server.tool(
			"ask_q_about_website",
			{
				url: z.string().url(),
				question: z.string().min(1)
			},
			async ({ url, question }: { url: string; question: string }) => {
				try {
					// Ensure browser is initialized
					await this.init();

					if (!this.browser) {
						console.error('Browser state:', {
							browserExists: !!this.browser,
							envHasBrowser: !!(env as any).BROWSER
						});
						return {
							content: [{
								type: "text",
								text: "Error: Browser functionality is not available. This could be due to:\n1. Missing BROWSER binding in your Cloudflare Workers configuration\n2. Insufficient permissions to use the browser binding\n3. Browser initialization failed\n\nPlease check your wrangler.jsonc configuration and ensure you have the necessary permissions.",
							}],
						};
					}

					console.log('Creating new page for URL:', url);
					const page = await this.browser.newPage();
					
					// Set basic headers
					await page.setExtraHTTPHeaders({
						'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
					});

					// Handle page errors
					page.on('error', err => {
						console.error('Page error:', err);
					});

					// Set a longer timeout and add retry logic
					const maxRetries = 3;
					let retryCount = 0;
					let lastError: Error | null = null;
					let response: any = null;

					while (retryCount < maxRetries) {
						try {
							console.log(`Attempt ${retryCount + 1} to navigate to ${url}`);
							response = await page.goto(url, {
								waitUntil: 'load',
								timeout: 30000 // 30 seconds timeout
							});
							
							// Check response status
							if (response?.status() === 502) {
								throw new Error('Website returned 502 Bad Gateway error');
							}
							
							console.log('Successfully navigated to page');
							break;
						} catch (error) {
							lastError = error as Error;
							console.error(`Navigation attempt ${retryCount + 1} failed:`, error);
							retryCount++;
							if (retryCount < maxRetries) {
								console.log('Retrying in 2 seconds...');
								await new Promise(resolve => setTimeout(resolve, 2000));
							}
						}
					}

					if (retryCount === maxRetries) {
						return {
							content: [{
								type: "text",
								text: `Unable to access the website. This could be due to:\n1. The website is blocking requests from Cloudflare\n2. The website is experiencing technical issues\n3. Network connectivity problems\n\nError details: ${lastError?.message}`
							}],
						};
					}

					// Extract page content
					const pageContent = await page.evaluate(() => {
						// Check if we're on an error page
						const errorText = document.body.innerText;
						if (errorText.includes('502') || errorText.includes('Bad Gateway')) {
							return {
								isError: true,
								errorText: errorText
							};
						}

						return {
							isError: false,
							title: document.title,
							description: document.querySelector('meta[name="description"]')?.getAttribute('content'),
							content: document.body.innerText.trim()
						};
					});

					await page.close();

					if (pageContent.isError) {
						return {
							content: [{
								type: "text",
								text: `The website appears to be experiencing technical issues:\n\n${pageContent.errorText}`
							}],
						};
					}

					// Use Cloudflare AI to answer the question
					const messages = [
						{ 
							role: "system", 
							content: "You are a helpful assistant that answers questions about website content. Use the provided website content to answer the user's question. If the information isn't available in the content, say so." 
						},
						{
							role: "user",
							content: `Website Title: ${pageContent.title}\nDescription: ${pageContent.description || 'No description'}\nContent: ${pageContent.content?.slice(0, 2000) || 'No content available'}\n\nQuestion: ${question}`
						}
					];

					const analysis = await (env as any).AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", { messages });

					return {
						content: [{
							type: "text",
							text: analysis.response || "Unable to answer the question about the website content."
						}],
					};
				} catch (error) {
					console.error('Error analyzing website:', error);
					return {
						content: [{
							type: "text",
							text: `Error analyzing website: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
						}],
					};
				}
			}
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			// @ts-ignore
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			// @ts-ignore
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
