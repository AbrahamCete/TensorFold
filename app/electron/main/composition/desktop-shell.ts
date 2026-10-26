import { app, BrowserWindow, session, dialog, Tray, Menu, MenuItem } from 'electron'
import { store } from '../state'
import { auditEvent, requireSecurityRole } from '../host/audit'
import { openExternalSafely } from '../host/external'
import { SshManager } from '../host/ssh'
import { WorkspaceMutationGuard } from '../host/workspace-mutation-guard'
import { registerCoreIpc } from '../host/core-ipc'
import { createDesktopModeRuntime } from '../host/desktop-mode'
import { desktopTrayIcon } from '../host/desktop-tray-icon'
import { createAppWindowRuntime } from '../host/app-window'
import { sendToRenderer } from '../host/renderer-events'
import { engineService } from '../host/engine-runtime'
import { installNativeTextEditing, ensureApplicationEditMenu } from '../host/native-text-editing'
import { requestRendererDraftFlush, observeComposerDraftRenderer } from '../host/ipc/composer-draft-ipc'
import { HEADLESS_MODE } from '../early-electron-paths'

interface DesktopShellDeps {
  baseDir: string
  sshManager: SshManager
  aborters: Map<string, AbortController>
  workspaceMutationGuard: WorkspaceMutationGuard
  isDraftQuitSettled(): boolean
  getCoreIpc(): Pick<ReturnType<typeof registerCoreIpc>, 'setDesktopMode'>
}

export function createApplicationDesktop(deps: DesktopShellDeps) {
  const { baseDir, sshManager, aborters, workspaceMutationGuard, isDraftQuitSettled, getCoreIpc } = deps
  const appWindowRuntime = createAppWindowRuntime({
    BrowserWindow,
    baseDir,
    openExternalSafely,
    session,
    onWindowClosed: () => sshManager.cancelPendingPrompts(),
    onWindowCreated: (win) => { observeComposerDraftRenderer(win.webContents); desktopModeRuntime.attachWindow(win) },
    shouldShowWindow: () => desktopModeRuntime.shouldShowWindow(),
    installTextEditing: (win) => { ensureApplicationEditMenu(Menu, (options) => new MenuItem(options), store.settings?.uiPreferences?.locale); installNativeTextEditing(win, Menu, () => store.settings?.uiPreferences?.locale) },
    shouldGuardWindowClose: () => !isDraftQuitSettled(),
    beforeWindowClose: (win) => requestRendererDraftFlush(win.webContents),
    onWindowCloseFailure: () => dialog.showErrorBox('Your draft needs attention', 'TensorFold could not confirm that unfinished messages were saved; keep the window open and retry saving the draft.'),

    onRendererFailure: (detail) => {
      console.error(`[tensorfold] ${detail}`)
      dialog.showErrorBox('TensorFold could not start its interface', `${detail}\n\nThe interface did not load. Reinstalling the app or starting it with a fresh profile may help.`)
    },
  })

  const appWindowApi = {
    installSessionHardening: () => appWindowRuntime.installSessionHardening(),
    createWindow: () => appWindowRuntime.createWindow(),
  }

  const desktopModeRuntime = createDesktopModeRuntime({
    headless: HEADLESS_MODE,
    getSettings: () => store.settings,
    getWindow: () => store.win,
    createWindow: () => appWindowRuntime.createWindow(),
    createTray: () => new Tray(desktopTrayIcon()),
    buildMenu: (items) => Menu.buildFromTemplate(items),
    showDock: () => { void app.dock?.show().catch(() => { }) },
    hideDock: () => app.dock?.hide(),
    changeMode: (mode) => getCoreIpc().setDesktopMode(mode),
    engineStatus: async () => engineService()?.status() ?? null,
    startModel: async (repo) => {
      requireSecurityRole('operator', 'start a local model')
      const reservation = workspaceMutationGuard.reserveStart({ workspaceKeys: ['engine:local'] })
      try {
        const engine = engineService()
        if (!engine) throw new Error('The built-in engine is unavailable.')
        await auditEvent('engine.load', { repo })
        return await engine.load(repo)
      } finally { reservation.release() }
    },
    stopModel: async () => {
      requireSecurityRole('operator', 'stop the local model')
      const reservation = workspaceMutationGuard.reserveStart({ workspaceKeys: ['engine:local'] })
      try { return await engineService()?.unload() } finally { reservation.release() }
    },
    activeLocalRuns: () => store.threads.filter((thread) => thread.providerId === 'tensorfold' && !thread.orchestratorHostId && thread.workspace?.kind !== 'ssh' && (thread.status === 'running' || aborters.has(thread.id))).length,
    learningBusy: () => engineService()?.isLearningBusy() ?? false,
    navigate: (target) => { sendToRenderer('desktop:navigate', { target }) },
    quit: () => app.quit(),
    reportError: (message) => dialog.showErrorBox('TensorFold', message),
  })
  app.on('second-instance', () => { if (app.isReady() && store.settings) desktopModeRuntime.show() })

  return { appWindowApi, desktopModeRuntime }
}
