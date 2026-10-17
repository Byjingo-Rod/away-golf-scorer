import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
assert(source.includes('"Pink"'),'Pink must be a standard tee colour');
assert(source.includes('Other — specify'),'The tee colour list must offer a custom value');
assert(source.includes('Enter the tee colour or tee denotation'),'Custom tee values must be manually enterable');
assert(source.includes('return saved || DEFAULT_TEE_MARKER_COLOURS'),'Saved custom tee values must be displayed throughout the app');
console.log('custom tee colour test passed');
