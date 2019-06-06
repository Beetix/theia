/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
import { inject, injectable } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { Command, CommandContribution, CommandRegistry, DisposableCollection, MenuContribution, MenuModelRegistry } from '@theia/core';
import { DiffUris, StatusBar, StatusBarEntry, Widget } from '@theia/core/lib/browser';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { EDITOR_CONTEXT_MENU, EditorContextMenu, EditorManager, EditorOpenerOptions, EditorWidget } from '@theia/editor/lib/browser';
import { Git, GitFileChange, GitFileStatus } from '../common';
import { GitRepositoryTracker } from './git-repository-tracker';
import { GitAction, GitQuickOpenService } from './git-quick-open-service';
import { GitSyncService } from './git-sync-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { GitRepositoryProvider } from './git-repository-provider';
import { GitErrorHandler } from '../browser/git-error-handler';
import { ScmTitleCommandsContribution, ScmTitleCommandRegistry } from '@theia/scm/lib/browser/scm-title-command-registry';
import { ScmWidget } from '@theia/scm/lib/browser/scm-widget';
import { ScmResourceCommandContribution, ScmResourceCommandRegistry } from '@theia/scm/lib/browser/scm-resource-command-registry';
import { ScmGroupCommandContribution, ScmGroupCommandRegistry } from '@theia/scm/lib/browser/scm-group-command-registry';

export const EDITOR_CONTEXT_MENU_GIT = [...EDITOR_CONTEXT_MENU, '3_git'];

export namespace GIT_COMMANDS {
    export const CLONE = {
        id: 'git.clone',
        label: 'Git: Clone...'
    };
    export const FETCH = {
        id: 'git.fetch',
        label: 'Git: Fetch...'
    };
    export const PULL_DEFAULT = {
        id: 'git.pull.default',
        label: 'Git: Pull'
    };
    export const PULL = {
        id: 'git.pull',
        label: 'Git: Pull from...'
    };
    export const PUSH_DEFAULT = {
        id: 'git.push.default',
        label: 'Git: Push'
    };
    export const PUSH = {
        id: 'git.push',
        label: 'Git: Push to...'
    };
    export const MERGE = {
        id: 'git.merge',
        label: 'Git: Merge...'
    };
    export const CHECKOUT = {
        id: 'git.checkout',
        label: 'Git: Checkout'
    };
    export const COMMIT = {
        id: 'git.commit.all',
        tooltip: 'Commit all the staged changes',
        text: 'Commit',
    };
    export const COMMIT_ADD_SIGN_OFF = {
        id: 'git-commit-add-sign-off',
        label: 'Add Signed-off-by',
        iconClass: 'fa fa-pencil-square-o',
        category: 'Git'
    };
    export const COMMIT_AMEND = {
        id: 'git.commit.amend'
    };
    export const COMMIT_SIGN_OFF = {
        id: 'git.commit.signOff'
    };
    export const OPEN_FILE: Command = {
        id: 'git.open.file',
        category: 'Git',
        label: 'Open File',
        iconClass: 'theia-open-file-icon'
    };
    export const OPEN_CHANGED_FILE: Command = {
        id: 'git.open.changed.file',
        category: 'Git',
        label: 'Open File',
        iconClass: 'open-file'
    };
    export const OPEN_CHANGES: Command = {
        id: 'git.open.changes',
        category: 'Git',
        label: 'Open Changes',
        iconClass: 'theia-open-change-icon'
    };
    export const SYNC = {
        id: 'git.sync',
        label: 'Git: Sync'
    };
    export const PUBLISH = {
        id: 'git.publish',
        label: 'Git: Publish Branch'
    };
    export const STAGE = {
        id: 'git.stage',
        category: 'Git',
        label: 'Stage Changes',
        iconClass: 'fa fa-plus'
    };
    export const STAGE_ALL = {
        id: 'git.stage.all',
        category: 'Git',
        label: 'Stage All Changes',
        iconClass: 'fa fa-plus',
    };
    export const UNSTAGE = {
        id: 'git.unstage',
        iconClass: 'fa fa-minus',
        category: 'Git',
        label: 'Unstage Changes'
    };
    export const UNSTAGE_ALL = {
        id: 'git.unstage.all',
        iconClass: 'fa fa-minus',
        category: 'Git',
        label: 'Unstage All',
    };
    export const DISCARD = {
        id: 'git.discard',
        iconClass: 'fa fa-undo',
        category: 'Git',
        label: 'Discard Changes'
    };
    export const DISCARD_ALL = {
        id: 'git.discard.all',
        iconClass: 'fa fa-undo',
        category: 'Git',
        label: 'Discard All Changes',
    };
    export const STASH = {
        id: 'git.stash',
        category: 'Git',
        label: 'Stash...'
    };
    export const APPLY_STASH = {
        id: 'git.stash.apply',
        category: 'Git',
        label: 'Apply Stash...'
    };
    export const APPLY_LATEST_STASH = {
        id: 'git.stash.apply.latest',
        category: 'Git',
        label: 'Apply Latest Stash'
    };
    export const POP_STASH = {
        id: 'git.stash.pop',
        category: 'Git',
        label: 'Pop Stash...'
    };
    export const POP_LATEST_STASH = {
        id: 'git.stash.pop.latest',
        category: 'Git',
        label: 'Pop Latest Stash'
    };
    export const DROP_STASH = {
        id: 'git.stash.drop',
        category: 'Git',
        label: 'Drop Stash...'
    };
    export const REFRESH = {
        id: 'git-refresh',
        label: 'Refresh',
        iconClass: 'fa fa-refresh',
        category: 'Git'
    };
}

@injectable()
export class GitContribution implements
    CommandContribution,
    MenuContribution,
    TabBarToolbarContribution,
    ScmTitleCommandsContribution,
    ScmResourceCommandContribution,
    ScmGroupCommandContribution {

    static GIT_CHECKOUT = 'git.checkout';
    static GIT_SYNC_STATUS = 'git-sync-status';

    protected toDispose = new DisposableCollection();

    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(GitQuickOpenService) protected readonly quickOpenService: GitQuickOpenService;
    @inject(GitRepositoryTracker) protected readonly repositoryTracker: GitRepositoryTracker;
    @inject(GitSyncService) protected readonly syncService: GitSyncService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider;
    @inject(Git) protected readonly git: Git;
    @inject(GitErrorHandler) protected readonly gitErrorHandler: GitErrorHandler;

    onStart(): void {
        this.repositoryProvider.onDidChangeRepository(repository => {
            if (!repository) {
                this.statusBar.removeElement(GitContribution.GIT_CHECKOUT);
                this.statusBar.removeElement(GitContribution.GIT_SYNC_STATUS);
            }
        });
        this.repositoryTracker.onGitEvent(event => {
            const { status } = event;
            const branch = status.branch ? status.branch : status.currentHead ? status.currentHead.substring(0, 8) : 'NO-HEAD';
            let dirty = '';
            if (status.changes.length > 0) {
                const conflicts = this.hasConflicts(status.changes);
                const staged = this.allStaged(status.changes);
                if (conflicts || staged) {
                    if (conflicts) {
                        dirty = '!';
                    } else if (staged) {
                        dirty = '+';
                    }
                } else {
                    dirty = '*';
                }
            }
            const scmProvider = this.repositoryProvider.selectedScmProvider;
            if (scmProvider) {
                scmProvider.status = status;
                scmProvider.setStatusBarCommands([{
                    id: GitContribution.GIT_CHECKOUT,
                    text: `$(code-fork) ${branch}${dirty}`,
                    command: GIT_COMMANDS.CHECKOUT.id
                }]);
            }
            this.updateSyncStatusBarEntry();
        });
        this.syncService.onDidChange(() => this.updateSyncStatusBarEntry());
    }

    registerMenus(menus: MenuModelRegistry): void {
        [GIT_COMMANDS.FETCH, GIT_COMMANDS.PULL_DEFAULT, GIT_COMMANDS.PULL, GIT_COMMANDS.PUSH_DEFAULT, GIT_COMMANDS.PUSH, GIT_COMMANDS.MERGE].forEach(command =>
            menus.registerMenuAction(ScmWidget.ContextMenu.FIRST_GROUP, {
                commandId: command.id,
                label: command.label.slice('Git: '.length)
            })
        );
        menus.registerMenuAction(ScmWidget.ContextMenu.INPUT_GROUP, {
            commandId: GIT_COMMANDS.COMMIT_AMEND.id,
            label: 'Commit (Amend)'
        });
        menus.registerMenuAction(ScmWidget.ContextMenu.INPUT_GROUP, {
            commandId: GIT_COMMANDS.COMMIT_SIGN_OFF.id,
            label: 'Commit (Signed Off)'
        });
        menus.registerMenuAction(ScmWidget.ContextMenu.BATCH, {
            commandId: GIT_COMMANDS.STAGE_ALL.id,
            label: 'Stage All Changes'
        });
        menus.registerMenuAction(ScmWidget.ContextMenu.BATCH, {
            commandId: GIT_COMMANDS.UNSTAGE_ALL.id,
            label: 'Unstage All Changes'
        });
        menus.registerMenuAction(ScmWidget.ContextMenu.BATCH, {
            commandId: GIT_COMMANDS.DISCARD_ALL.id,
            label: 'Discard All Changes'
        });
        menus.registerMenuAction(EditorContextMenu.NAVIGATION, {
            commandId: GIT_COMMANDS.OPEN_FILE.id
        });
        menus.registerMenuAction(EditorContextMenu.NAVIGATION, {
            commandId: GIT_COMMANDS.OPEN_CHANGES.id
        });
        [GIT_COMMANDS.STASH, GIT_COMMANDS.APPLY_STASH,
        GIT_COMMANDS.APPLY_LATEST_STASH, GIT_COMMANDS.POP_STASH,
        GIT_COMMANDS.POP_LATEST_STASH, GIT_COMMANDS.DROP_STASH].forEach(command =>
            menus.registerMenuAction(ScmWidget.ContextMenu.SECOND_GROUP, {
                commandId: command.id,
                label: command.label
            })
        );
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(GIT_COMMANDS.FETCH, {
            execute: () => this.quickOpenService.fetch(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.PULL_DEFAULT, {
            execute: () => this.quickOpenService.performDefaultGitAction(GitAction.PULL),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.PULL, {
            execute: () => this.quickOpenService.pull(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.PUSH_DEFAULT, {
            execute: () => this.quickOpenService.performDefaultGitAction(GitAction.PUSH),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.PUSH, {
            execute: () => this.quickOpenService.push(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.MERGE, {
            execute: () => this.quickOpenService.merge(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.CHECKOUT, {
            execute: () => this.quickOpenService.checkout(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.COMMIT_SIGN_OFF, {
            execute: () => this.commit({ signOff: true }),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.COMMIT_AMEND, {
            execute: async () => {
                try {
                    const message = await this.quickOpenService.commitMessageForAmend();
                    await this.commit({ message, amend: true });
                } catch (e) {
                    if (!(e instanceof Error) || e.message !== 'User abort.') {
                        throw e;
                    }
                }
            },
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.STAGE_ALL, {
            execute: () => {
                const provider = this.repositoryProvider.selectedScmProvider;
                return provider && provider.stageAll();
            },
            isEnabled: () => !!this.repositoryProvider.selectedScmProvider
        });
        registry.registerCommand(GIT_COMMANDS.UNSTAGE_ALL, {
            execute: () => {
                const provider = this.repositoryProvider.selectedScmProvider;
                return provider && provider.unstageAll();
            },
            isEnabled: () => !!this.repositoryProvider.selectedScmProvider
        });
        registry.registerCommand(GIT_COMMANDS.DISCARD_ALL, {
            execute: () => {
                const provider = this.repositoryProvider.selectedScmProvider;
                return provider && provider.discardAll();
            },
            isEnabled: () => !!this.repositoryProvider.selectedScmProvider
        });
        registry.registerCommand(GIT_COMMANDS.OPEN_FILE, {
            execute: widget => this.openFile(widget),
            isEnabled: widget => !!this.getOpenFileOptions(widget),
            isVisible: widget => !!this.getOpenFileOptions(widget)
        });
        registry.registerCommand(GIT_COMMANDS.OPEN_CHANGES, {
            execute: widget => this.openChanges(widget),
            isEnabled: widget => !!this.getOpenChangesOptions(widget),
            isVisible: widget => !!this.getOpenChangesOptions(widget)
        });
        registry.registerCommand(GIT_COMMANDS.SYNC, {
            execute: () => this.syncService.sync(),
            isEnabled: () => this.syncService.canSync(),
            isVisible: () => this.syncService.canSync()
        });
        registry.registerCommand(GIT_COMMANDS.PUBLISH, {
            execute: () => this.syncService.publish(),
            isEnabled: () => this.syncService.canPublish(),
            isVisible: () => this.syncService.canPublish()
        });
        registry.registerCommand(GIT_COMMANDS.CLONE, {
            isEnabled: () => this.workspaceService.opened,
            execute: (url?: string, folder?: string, branch?: string) =>
                this.quickOpenService.clone(url, folder, branch)
        });
        registry.registerCommand(GIT_COMMANDS.COMMIT, {
            execute: () => this.commit(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.REFRESH, {
            execute: () => this.repositoryProvider.refresh()
        });
        registry.registerCommand(GIT_COMMANDS.COMMIT_ADD_SIGN_OFF, {
            execute: async () => this.addSignOff(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.UNSTAGE, {
            execute: (uri: string) => {
                const provider = this.repositoryProvider.selectedScmProvider;
                return provider && provider.unstage(uri);
            },
            isEnabled: () => !!this.repositoryProvider.selectedScmProvider
        });
        registry.registerCommand(GIT_COMMANDS.STAGE, {
            execute: (uri: string) => {
                const provider = this.repositoryProvider.selectedScmProvider;
                return provider && provider.stage(uri);
            },
            isEnabled: () => !!this.repositoryProvider.selectedScmProvider
        });
        registry.registerCommand(GIT_COMMANDS.DISCARD, {
            execute: (uri: string) => {
                const provider = this.repositoryProvider.selectedScmProvider;
                return provider && provider.discard(uri);
            },
            isEnabled: () => !!this.repositoryProvider.selectedScmProvider
        });
        registry.registerCommand(GIT_COMMANDS.OPEN_CHANGED_FILE, {
            execute: (uri: string) => this.editorManager.open(new URI(uri), { mode: 'reveal' })
        });
        registry.registerCommand(GIT_COMMANDS.STASH, {
            execute: () => this.quickOpenService.stash(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository &&
                !!this.repositoryTracker.selectedRepositoryStatus &&
                this.repositoryTracker.selectedRepositoryStatus.changes.length > 0
        });
        registry.registerCommand(GIT_COMMANDS.APPLY_STASH, {
            execute: () => this.quickOpenService.applyStash(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.APPLY_LATEST_STASH, {
            execute: () => this.quickOpenService.applyLatestStash(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.POP_STASH, {
            execute: () => this.quickOpenService.popStash(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.POP_LATEST_STASH, {
            execute: () => this.quickOpenService.popLatestStash(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.DROP_STASH, {
            execute: () => this.quickOpenService.dropStash(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: GIT_COMMANDS.OPEN_FILE.id,
            command: GIT_COMMANDS.OPEN_FILE.id,
            tooltip: GIT_COMMANDS.OPEN_FILE.label
        });
        registry.registerItem({
            id: GIT_COMMANDS.OPEN_CHANGES.id,
            command: GIT_COMMANDS.OPEN_CHANGES.id,
            tooltip: GIT_COMMANDS.OPEN_CHANGES.label
        });
    }

    protected hasConflicts(changes: GitFileChange[]): boolean {
        return changes.some(c => c.status === GitFileStatus.Conflicted);
    }

    protected allStaged(changes: GitFileChange[]): boolean {
        return !changes.some(c => !c.staged);
    }

    protected async openFile(widget?: Widget): Promise<EditorWidget | undefined> {
        const options = this.getOpenFileOptions(widget);
        return options && this.editorManager.open(options.uri, options.options);
    }

    protected getOpenFileOptions(widget?: Widget): GitOpenFileOptions | undefined {
        const ref = widget ? widget : this.editorManager.currentEditor;
        if (ref instanceof EditorWidget && DiffUris.isDiffUri(ref.editor.uri)) {
            const [, right] = DiffUris.decode(ref.editor.uri);
            const uri = right.withScheme('file');
            const selection = ref.editor.selection;
            return { uri, options: { selection, widgetOptions: { ref } } };
        }
        return undefined;
    }

    async openChanges(widget?: Widget): Promise<EditorWidget | undefined> {
        const options = this.getOpenChangesOptions(widget);
        if (options) {
            const provider = this.repositoryProvider.selectedScmProvider;
            return provider && provider.openChange(options.change, options.options);
        }
        return undefined;
    }

    protected getOpenChangesOptions(widget?: Widget): GitOpenChangesOptions | undefined {
        const provider = this.repositoryProvider.selectedScmProvider;
        if (!provider) {
            return undefined;
        }
        const ref = widget ? widget : this.editorManager.currentEditor;
        if (ref instanceof EditorWidget && !DiffUris.isDiffUri(ref.editor.uri)) {
            const uri = ref.editor.uri;
            const change = provider.findChange(uri);
            if (change && provider.getUriToOpen(change).toString() !== uri.toString()) {
                const selection = ref.editor.selection;
                return { change, options: { selection, widgetOptions: { ref } } };
            }
        }
        return undefined;
    }

    protected updateSyncStatusBarEntry(): void {
        const scmProvider = this.repositoryProvider.selectedScmProvider;
        const entry = this.getStatusBarEntry();
        if (entry && scmProvider) {
            scmProvider.setStatusBarCommands([{
                id: GitContribution.GIT_SYNC_STATUS,
                text: entry.text,
                tooltip: entry.tooltip,
                command: entry.command,
            }]);
        } else {
            this.statusBar.removeElement(GitContribution.GIT_SYNC_STATUS);
        }
    }
    protected getStatusBarEntry(): (Pick<StatusBarEntry, 'text'> & Partial<StatusBarEntry>) | undefined {
        const status = this.repositoryTracker.selectedRepositoryStatus;
        if (!status || !status.branch) {
            return undefined;
        }
        if (this.syncService.isSyncing()) {
            return {
                text: '$(refresh~spin)',
                tooltip: 'Synchronizing Changes...'
            };
        }
        const { upstreamBranch, aheadBehind } = status;
        if (upstreamBranch) {
            return {
                text: '$(refresh)' + (aheadBehind && (aheadBehind.ahead + aheadBehind.behind) > 0 ? ` ${aheadBehind.behind}↓ ${aheadBehind.ahead}↑` : ''),
                command: GIT_COMMANDS.SYNC.id,
                tooltip: 'Synchronize Changes'
            };
        }
        return {
            text: '$(cloud-upload)',
            command: GIT_COMMANDS.PUBLISH.id,
            tooltip: 'Publish Changes'
        };
    }

    async commit(options: Git.Options.Commit & { message?: string } = {}): Promise<void> {
        const scmRepository = this.repositoryProvider.selectedScmRepository;
        if (!scmRepository) {
            return;
        }
        const repository = scmRepository.provider.repository;
        const message = options.message || scmRepository.input.value;
        scmRepository.input.issue = undefined;
        if (!message.trim()) {
            scmRepository.input.issue = {
                type: 'error',
                message: 'Please provide a commit message'
            };
        }
        if (scmRepository.input.issue === undefined && !(await this.git.status(repository)).changes.some(c => c.staged === true)) {
            scmRepository.input.issue = {
                type: 'error',
                message: 'No changes added to commit'
            };
        }
        if (!scmRepository.input.issue) {
            try {
                // We can make sure, repository exists, otherwise we would not have this button.
                const { signOff, amend } = options;
                await this.git.commit(repository, message, { signOff, amend });
                scmRepository.input.value = '';
            } catch (error) {
                this.gitErrorHandler.handleError(error);
            }
        } else {
            scmRepository.input.focus();
        }
    }

    async addSignOff(): Promise<void> {
        const scmRepository = this.repositoryProvider.selectedScmRepository;
        if (!scmRepository) {
            return;
        }
        const repository = scmRepository.provider.repository;
        const [username, email] = (await Promise.all([
            this.git.exec(repository, ['config', 'user.name']),
            this.git.exec(repository, ['config', 'user.email'])
        ])).map(result => result.stdout.trim());

        const signOff = `\n\nSigned-off-by: ${username} <${email}>`;
        const value = scmRepository.input.value;
        if (value.endsWith(signOff)) {
            scmRepository.input.value = value.substr(0, value.length - signOff.length);
        } else {
            scmRepository.input.value = `${value}${signOff}`;
        }
        scmRepository.input.focus();
    }

    registerScmTitleCommands(registry: ScmTitleCommandRegistry): void {
        registry.registerItem({ command: GIT_COMMANDS.REFRESH.id, group: 'navigation' });
        registry.registerItem({ command: GIT_COMMANDS.COMMIT_ADD_SIGN_OFF.id, group: 'navigation' });
    }

    registerScmResourceCommands(registry: ScmResourceCommandRegistry): void {
        registry.registerItems('Changes', [
            {
                command: GIT_COMMANDS.OPEN_CHANGED_FILE.id,
                group: 'navigation'
            },
            {
                command: GIT_COMMANDS.DISCARD.id,
                group: 'navigation'
            },
            {
                command: GIT_COMMANDS.STAGE.id,
                group: 'navigation'
            }
        ]);
        registry.registerItems('Staged changes', [
            {
                command: GIT_COMMANDS.OPEN_CHANGED_FILE.id,
                group: 'navigation'
            },
            {
                command: GIT_COMMANDS.UNSTAGE.id,
                group: 'navigation'
            }
        ]);
        registry.registerItems('Merged Changes', [
            {
                command: GIT_COMMANDS.OPEN_CHANGED_FILE.id,
                group: 'navigation'
            },
            {
                command: GIT_COMMANDS.DISCARD.id,
                group: 'navigation'
            },
            {
                command: GIT_COMMANDS.STAGE.id,
                group: 'navigation'
            }
        ]);
    }

    registerScmGroupCommands(registry: ScmGroupCommandRegistry): void {
        registry.registerItems('Changes', [
            {
                command: GIT_COMMANDS.DISCARD_ALL.id,
                group: 'inline'
            },
            {
                command: GIT_COMMANDS.STAGE_ALL.id,
                group: 'inline'
            }
        ]);
        registry.registerItems('Staged changes', [{ command: GIT_COMMANDS.UNSTAGE_ALL.id, group: 'inline' }]);
        registry.registerItems('Merged Changes', [{ command: GIT_COMMANDS.STAGE_ALL.id, group: 'inline' }]);
    }
}
export interface GitOpenFileOptions {
    readonly uri: URI
    readonly options?: EditorOpenerOptions
}
export interface GitOpenChangesOptions {
    readonly change: GitFileChange
    readonly options?: EditorOpenerOptions
}
