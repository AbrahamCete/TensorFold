import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const source = path.resolve(process.argv[2] || '')
const expectedSource = 'eea9dc9c9c8b459c0a03de7f6fe0c6f4835d69ab'
if (process.platform !== 'win32') throw new Error('Stage the native Windows engine on its Windows build host.')
if (execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== expectedSource) {
  throw new Error('Windows engine source does not match the pinned 1.1.6 commit.')
}
const manifest = JSON.parse(await readFile('build/engine.json', 'utf8'))
const binary = path.join(source, 'zig-out/native/bin/tensorfold-native.exe')
if (execFileSync(binary, ['--version'], { encoding: 'utf8', timeout: 10_000 }).trim() !== `tensorfold-native ${manifest.version}`) {
  throw new Error('Built Windows engine version does not match the app pin.')
}
const destination = path.resolve('build/engine')
await mkdir(path.join(destination, 'bin'), { recursive: true })
await copyFile(binary, path.join(destination, 'bin/tensorfold-native.exe'))
for (const name of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md']) await copyFile(path.join(source, name), path.join(destination, name))
await writeFile(path.join(destination, 'VERSION'), `${manifest.version}\n`)
await writeFile(path.join(destination, 'BUILD-PROVENANCE.json'), JSON.stringify({
  sourceCommit: expectedSource, version: manifest.version, platform: 'windows-x64',
  sha256: createHash('sha256').update(await readFile(binary)).digest('hex'),
  qualification: 'CI compilation and CLI only; GPU inference requires a Windows NVIDIA device',
}, null, 2) + '\n')
