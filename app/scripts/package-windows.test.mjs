import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { windowsPackageArgs } from './package-windows.mjs'
import { resolvePackagedWindowsExecutable, windowsSmokeEnvironment } from './smoke-packaged-windows.mjs'

const require = createRequire(import.meta.url)
const config = require('./windows-builder-config.cjs')
const shared = require('../package.json').build
assert.ok(windowsPackageArgs(['--dir'], 'win32', 'x64').includes('--dir'))
assert.ok(windowsPackageArgs(['--nsis'], 'win32', 'x64').includes('nsis'))
assert.equal(windowsPackageArgs(['--nsis'], 'win32', 'x64').at(-1), 'never')
assert.throws(() => windowsPackageArgs(['--nsis'], 'darwin', 'arm64'), /Windows x64 build host/)
assert.throws(() => windowsPackageArgs(['--publish', 'always'], 'win32', 'x64'), /exactly --dir or --nsis/)
assert.throws(() => resolvePackagedWindowsExecutable(undefined, 'linux'), /requires Windows/)
assert.deepEqual(config.files, shared.files)
assert.deepEqual(config.electronFuses, shared.electronFuses)
assert.deepEqual(config.extraResources.map(item => item.to), ['engine', 'voice-notices', 'third-party-notices'])
assert.equal(config.nsis.deleteAppDataOnUninstall, false)
assert.equal(shared.forceCodeSigning, true)
const env = windowsSmokeEnvironment({
  SystemRoot: 'C:\\Windows', PATH: 'C:\\Windows\\System32',
  OPENAI_API_KEY: 'synthetic-secret', GITHUB_TOKEN: 'synthetic-token', NODE_OPTIONS: '--inspect', ELECTRON_RUN_AS_NODE: '1',
}, process.cwd(), 43210)
assert.equal(env.SystemRoot, 'C:\\Windows')
assert.equal(env.VONTRA_HOME, process.cwd())
for (const key of ['OPENAI_API_KEY', 'GITHUB_TOKEN', 'NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE']) assert.equal(env[key], undefined)
console.log('Windows package policy, shared assets/fuses, platform refusal and isolated smoke environment passed')
