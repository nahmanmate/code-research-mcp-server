#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import NodeCache from 'node-cache';

// Cache results for 1 hour
const cache = new NodeCache({ stdTTL: 3600 });

// Optional GitHub token for higher rate limits
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

class CodeResearchServer {
  private server: Server;
  private axiosInstance;
  private githubInstance;

  constructor() {
    this.server = new Server(
      {
        name: 'code-research-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CodeResearchBot/1.0)',
      },
    });

    this.githubInstance = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'CodeResearchBot/1.0',
        ...(GITHUB_TOKEN && { 'Authorization': `token ${GITHUB_TOKEN}` })
      }
    });

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async searchStackOverflow(query: string, limit: number = 5): Promise<string> {
    const cacheKey = `stackoverflow:${query}:${limit}`;
    const cached = cache.get<string>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.axiosInstance.get(
        `https://api.stackexchange.com/2.3/search/advanced`,
        {
          params: {
            q: query,
            site: 'stackoverflow',
            pagesize: limit,
            order: 'desc',
            sort: 'votes',
            filter: 'withbody'
          }
        }
      );

      const results = response.data.items.map((item: any) => {
        const $ = cheerio.load(item.body);
        return {
          title: item.title,
          link: item.link,
          score: item.score,
          answer_count: item.answer_count,
          excerpt: $.text().substring(0, 200) + '...'
        };
      });

      const formatted = results.map((r: any, i: number) => 
        `${i + 1}. ${r.title}\n   Score: ${r.score} | Answers: ${r.answer_count}\n   ${r.link}\n   ${r.excerpt}\n`
      ).join('\n');

      cache.set(cacheKey, formatted);
      return formatted;
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Stack Overflow API error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async searchMDN(query: string): Promise<string> {
    const cacheKey = `mdn:${query}`;
    const cached = cache.get<string>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.axiosInstance.get(
        'https://developer.mozilla.org/api/v1/search',
        {
          params: {
            q: query,
            locale: 'en-US'
          }
        }
      );

      const results = response.data.documents.slice(0, 5).map((doc: any, i: number) => 
        `${i + 1}. ${doc.title}\n   ${doc.summary}\n   https://developer.mozilla.org${doc.mdn_url}\n`
      ).join('\n');

      cache.set(cacheKey, results);
      return results;
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `MDN API error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async searchGitHub(query: string, language?: string, limit: number = 5): Promise<string> {
    const cacheKey = `github:${query}:${language}:${limit}`;
    const cached = cache.get<string>(cacheKey);
    if (cached) return cached;

    try {
      // Build search query with language filter if specified
      const q = language ? `${query} language:${language}` : query;
      
      // If GitHub token is invalid, fall back to unauthenticated requests
      const makeRequest = async (endpoint: string, params: any) => {
        try {
          const response = await this.githubInstance.get(endpoint, { params });
          return response;
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 401) {
            // Retry without auth token
            const response = await this.axiosInstance.get(`https://api.github.com${endpoint}`, {
              params,
              headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'CodeResearchBot/1.0'
              }
            });
            return response;
          }
          throw error;
        }
      };

      const [reposResponse, codeResponse] = await Promise.all([
        makeRequest('/search/repositories', {
          q,
          sort: 'stars',
          order: 'desc',
          per_page: limit
        }),
        makeRequest('/search/code', {
          q,
          sort: 'indexed',
          order: 'desc',
          per_page: limit
        })
      ]);

      let result = '=== Top Repositories ===\n';
      result += reposResponse.data.items.map((repo: any, i: number) => 
        `${i + 1}. ${repo.full_name} (⭐ ${repo.stargazers_count})\n` +
        `   ${repo.description || 'No description'}\n` +
        `   ${repo.html_url}\n`
      ).join('\n');

      result += '\n=== Relevant Code ===\n';
      result += codeResponse.data.items.map((item: any, i: number) => 
        `${i + 1}. ${item.name} (${item.repository.full_name})\n` +
        `   Path: ${item.path}\n` +
        `   ${item.html_url}\n`
      ).join('\n');

      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `GitHub API error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async searchNpm(query: string, limit: number = 5): Promise<string> {
    const cacheKey = `npm:${query}:${limit}`;
    const cached = cache.get<string>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.axiosInstance.get(
        `https://registry.npmjs.org/-/v1/search`,
        {
          params: {
            text: query,
            size: limit
          }
        }
      );

      const results = response.data.objects.map((item: any, i: number) => {
        const pkg = item.package;
        return `${i + 1}. ${pkg.name} (v${pkg.version})\n` +
               `   ${pkg.description || 'No description'}\n` +
               `   Weekly Downloads: ${pkg.downloads}\n` +
               `   ${pkg.links.npm}\n`;
      }).join('\n');

      cache.set(cacheKey, results);
      return results;
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `npm API error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async searchPyPI(query: string, limit: number = 5): Promise<string> {
    const cacheKey = `pypi:${query}:${limit}`;
    const cached = cache.get<string>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.axiosInstance.get(
        `https://pypi.org/pypi/${encodeURIComponent(query)}/json`
      );

      const pkg = response.data.info;
      const result = `Package: ${pkg.name} (v${pkg.version})\n` +
                    `Description: ${pkg.summary || 'No description'}\n` +
                    `Author: ${pkg.author || 'Unknown'}\n` +
                    `Homepage: ${pkg.home_page || pkg.project_url || 'N/A'}\n` +
                    `PyPI: https://pypi.org/project/${pkg.name}/\n`;

      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return `No package found for "${query}"`;
      }
      throw new McpError(
        ErrorCode.InternalError,
        `PyPI API error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async searchAll(query: string, limit: number = 3): Promise<string> {
    const cacheKey = `all:${query}:${limit}`;
    const cached = cache.get<string>(cacheKey);
    if (cached) return cached;

    try {
      // Execute non-GitHub searches first
      const [so, mdn, npm, pypi] = await Promise.all([
        this.searchStackOverflow(query, limit).catch(error =>
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        ),
        this.searchMDN(query).catch(error =>
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        ),
        this.searchNpm(query, limit).catch(error =>
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        ),
        this.searchPyPI(query).catch(error =>
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      ]);

      let results = `=== Stack Overflow Results ===\n${so}\n\n` +
                   `=== MDN Documentation ===\n${mdn}\n\n`;

      // Try GitHub search separately
      try {
        const gh = await this.searchGitHub(query, undefined, limit);
        results += `=== GitHub Results ===\n${gh}\n\n`;
      } catch (error) {
        results += `=== GitHub Results ===\nGitHub search currently unavailable\n\n`;
      }

      results += `=== npm Packages ===\n${npm}\n\n` +
                `=== PyPI Packages ===\n${pypi}`;

      cache.set(cacheKey, results);
      return results;
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Search all platforms error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_stackoverflow',
          description: 'Search Stack Overflow for programming questions and answers',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query'
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 5)',
                minimum: 1,
                maximum: 10
              }
            },
            required: ['query']
          }
        },
        {
          name: 'search_mdn',
          description: 'Search MDN Web Docs for web development documentation',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query'
              }
            },
            required: ['query']
          }
        },
        {
          name: 'search_github',
          description: 'Search GitHub for repositories and code',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query'
              },
              language: {
                type: 'string',
                description: 'Filter by programming language'
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results per category (default: 5)',
                minimum: 1,
                maximum: 10
              }
            },
            required: ['query']
          }
        },
        {
          name: 'search_npm',
          description: 'Search npm registry for JavaScript packages',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query'
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 5)',
                minimum: 1,
                maximum: 10
              }
            },
            required: ['query']
          }
        },
        {
          name: 'search_pypi',
          description: 'Search PyPI for Python packages',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query'
              }
            },
            required: ['query']
          }
        },
        {
          name: 'search_all',
          description: 'Search all platforms simultaneously',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query'
              },
              limit: {
                type: 'number',
                description: 'Maximum results per platform (1-5, default: 3)',
                minimum: 1,
                maximum: 5
              }
            },
            required: ['query']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'search_stackoverflow': {
          const { query, limit } = request.params.arguments as { query: string; limit?: number };
          const results = await this.searchStackOverflow(query, limit);
          return {
            content: [
              {
                type: 'text',
                text: results
              }
            ]
          };
        }

        case 'search_mdn': {
          const { query } = request.params.arguments as { query: string };
          const results = await this.searchMDN(query);
          return {
            content: [
              {
                type: 'text',
                text: results
              }
            ]
          };
        }

        case 'search_github': {
          const { query, language, limit } = request.params.arguments as { 
            query: string; 
            language?: string;
            limit?: number;
          };
          const results = await this.searchGitHub(query, language, limit);
          return {
            content: [
              {
                type: 'text',
                text: results
              }
            ]
          };
        }

        case 'search_npm': {
          const { query, limit } = request.params.arguments as { query: string; limit?: number };
          const results = await this.searchNpm(query, limit);
          return {
            content: [
              {
                type: 'text',
                text: results
              }
            ]
          };
        }

        case 'search_pypi': {
          const { query } = request.params.arguments as { query: string };
          const results = await this.searchPyPI(query);
          return {
            content: [
              {
                type: 'text',
                text: results
              }
            ]
          };
        }

        case 'search_all': {
          const { query, limit } = request.params.arguments as { query: string; limit?: number };
          const results = await this.searchAll(query, limit);
          return {
            content: [
              {
                type: 'text',
                text: results
              }
            ]
          };
        }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Code Research MCP server running on stdio');
  }
}

const server = new CodeResearchServer();
server.run().catch(console.error);
