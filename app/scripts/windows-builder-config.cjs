const { build: shared } = require('../package.json')

module.exports = {
  extends: null,
  appId: shared.appId,
  productName: shared.productName,
  npmRebuild: shared.npmRebuild,
  directories: { ...shared.directories, output: 'release/windows' },
  files: [...shared.files],
  extraResources: shared.extraResources.filter(({ to }) => ['engine', 'voice-notices', 'third-party-notices'].includes(to)),
  asar: shared.asar,
  forceCodeSigning: false,
  electronFuses: { ...shared.electronFuses },
  asarUnpack: ['node_modules/onnxruntime-node/bin/napi-v3/win32/x64/**/*'],
  publish: null,
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    artifactName: '${productName}-${version}-windows-${arch}-setup.${ext}',
    icon: 'build/icon.png',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: false,
    createStartMenuShortcut: true,
  },
}
