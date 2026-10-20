/**
 * Names and endpoints the AC2 check rejects.
 * This module is data for the scanner. Do not import these packages from here.
 */

/** Exact npm package names. The `ai` entry is the Vercel AI SDK, matched exactly. */
export const FORBIDDEN_PACKAGES = [
  'openai',
  'anthropic',
  'langchain',
  '@google/generative-ai',
  '@google/genai',
  '@google-cloud/vertexai',
  'grok',
  'xai',
  'ai',
];

/** Scoped package prefixes, including the trailing slash. */
export const FORBIDDEN_PACKAGE_PREFIXES = ['@ai-sdk/', '@langchain/', '@anthropic-ai/', '@xai/'];

/** PyPI distributions corresponding to the same clients. */
export const FORBIDDEN_PYPI_PACKAGES = [
  'openai',
  'anthropic',
  'langchain',
  'google-generativeai',
  'google-genai',
];

/** Hosts of hosted model APIs. Presence alone is not enough; the scanner looks for a call. */
export const MODEL_HOSTS = [
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.x.ai',
  'api.groq.com',
  'api.mistral.ai',
  'api.cohere.ai',
  'api.together.xyz',
  'api.fireworks.ai',
];

/**
 * @param {string} name
 */
export function isForbiddenPackage(name) {
  if (FORBIDDEN_PACKAGES.includes(name)) return true;
  return FORBIDDEN_PACKAGE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * @param {string} specifier
 */
export function packageNameFromSpecifier(specifier) {
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/');
    if (!scope || !name) return specifier;
    return `${scope}/${name}`;
  }
  return specifier.split('/')[0] ?? specifier;
}
