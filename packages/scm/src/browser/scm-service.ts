/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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
import { Disposable, DisposableCollection, Emitter, Event } from '@theia/core/lib/common';
import { injectable } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { JSONExt, JSONObject } from '@phosphor/coreutils/lib/json';

export interface ScmProvider extends Disposable {
    readonly label: string;
    readonly id: string;
    readonly contextValue: string;

    readonly groups: ScmResourceGroup[];

    readonly rootUri: string;
    readonly onDidChangeCommitTemplate?: Event<string>;
    readonly onDidChangeStatusBarCommands?: Event<ScmCommand[]>;
    readonly acceptInputCommand?: ScmCommand;
    readonly onDidChange: Event<void>;

    readonly amendSupport?: ScmAmendSupport;

    // TODO: get rid of it, only plugin specific
    readonly handle: number;
}

export interface ScmResourceGroup extends Disposable {
    readonly id: string;
    readonly label: string;
    readonly resources: ScmResource[];

    readonly provider: ScmProvider;

    // TODO: get rid of it, only plugin specific
    readonly handle: number;
    readonly sourceControlHandle: number;
}

export interface ScmResource {
    readonly sourceUri: URI;
    readonly decorations?: ScmResourceDecorations;
    readonly selected?: boolean;
    open(): Promise<void>;

    readonly group: ScmResourceGroup;

    // TODO: get rid of it, only plugin specific
    readonly handle: number;
    readonly groupHandle: number;
    readonly sourceControlHandle: number;
}

export interface ScmResourceDecorations {
    icon?: string;
    tooltip?: string;
    source?: string;
    letter?: string;
    color?: string;
}

export interface ScmCommand {
    id: string;
    text: string;
    tooltip?: string;
    command?: string;
}

export interface ScmInputIssue {
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
}

export interface ScmInputValidator {
    (value: string): Promise<ScmInputIssue | undefined>;
}

export interface ScmCommit {
    id: string,  // eg Git sha or Mercurial revision number
    summary: string,
    authorName: string,
    authorEmail: string,
    authorDateRelative: string
}

export interface ScmAmendSupport {
    getInitialAmendingCommits(amendingHeadCommitSha: string, latestCommitSha: string): Promise<ScmCommit[]>
    getMessage(commit: string): Promise<string>;
    reset(commit: string): Promise<void>;
    getLastCommit(): Promise<ScmCommit | undefined>;
}

@injectable()
export class ScmService {
    private readonly _repositories = new Map<string, ScmRepository>();
    private _selectedRepository: ScmRepository | undefined;

    private onDidChangeSelectedRepositoriesEmitter = new Emitter<ScmRepository | undefined>();
    private onDidAddProviderEmitter = new Emitter<ScmRepository>();
    private onDidRemoveProviderEmitter = new Emitter<ScmRepository>();

    readonly onDidChangeSelectedRepository: Event<ScmRepository | undefined> = this.onDidChangeSelectedRepositoriesEmitter.event;

    get repositories(): ScmRepository[] {
        return [...this._repositories.values()];
    }

    get selectedRepository(): ScmRepository | undefined {
        return this._selectedRepository;
    }

    set selectedRepository(repository: ScmRepository | undefined) {
        this._selectedRepository = repository;
        this.onDidChangeSelectedRepositoriesEmitter.fire(repository);
    }

    getRepository(id: string): ScmRepository | undefined {
        return this._repositories.get(id);
    }

    get onDidAddRepository(): Event<ScmRepository> {
        return this.onDidAddProviderEmitter.event;
    }

    get onDidRemoveRepository(): Event<ScmRepository> {
        return this.onDidRemoveProviderEmitter.event;
    }

    registerScmProvider(provider: ScmProvider, options: ScmProviderOptions = {}): ScmRepository {
        if (this._repositories.has(provider.id)) {
            throw new Error(`SCM Provider ${provider.id} already exists.`);
        }
        const repository = new ScmRepository(provider, options);
        const dispose = repository.dispose;
        repository.dispose = () => {
            this._repositories.delete(provider.id);
            dispose.bind(repository)();
            this.onDidRemoveProviderEmitter.fire(repository);
            if (this._selectedRepository === repository) {
                this.selectedRepository = this._repositories.values().next().value;
            }
        };
        this._repositories.set(provider.id, repository);
        this.onDidAddProviderEmitter.fire(repository);
        if (this._repositories.size === 1) {
            this.selectedRepository = repository;
        }
        return repository;
    }

}

export interface ScmProviderOptions {
    input?: ScmInputOptions
}

export class ScmRepository implements Disposable {

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    protected fireDidChange(): void {
        this.onDidChangeEmitter.fire(undefined);
    }

    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    readonly input: ScmInput;

    constructor(
        readonly provider: ScmProvider,
        protected readonly options: ScmProviderOptions = {}
    ) {
        this.toDispose.pushAll([
            this.provider,
            this.provider.onDidChange(() => this.updateResources()),
            this.input = new ScmInput(options.input),
            this.input.onDidChange(() => this.fireDidChange())
        ]);
        this.updateResources();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected readonly _resources: ScmResource[] = [];
    get resources(): ScmResource[] {
        return this._resources;
    }
    protected updateResources(): void {
        this._resources.length = 0;
        for (const group of this.provider.groups) {
            this._resources.push(...group.resources);
        }
        this.updateSelection();
    }

    protected selectedIndex: number = -1;
    get selectedResource(): ScmResource | undefined {
        return this._resources[this.selectedIndex];
    }
    set selectedResource(selectedResource: ScmResource | undefined) {
        this.selectedIndex = selectedResource ? this._resources.indexOf(selectedResource) : -1;
        this.fireDidChange();
    }
    protected updateSelection(): void {
        this.selectedResource = this.selectedResource;
    }

    selectNextResource(): ScmResource | undefined {
        if (this.selectedIndex && this.selectedIndex < this._resources.length - 1) {
            this.selectedIndex++;
            this.fireDidChange();
        } else if (this._resources.length && this.selectedIndex === -1) {
            this.selectedIndex = 0;
            this.fireDidChange();
        }
        return this.selectedResource;
    }

    selectPreviousResource(): ScmResource | undefined {
        if (this.selectedIndex) {
            this.selectedIndex--;
            this.fireDidChange();
        }
        return this.selectedResource;
    }

}

export interface ScmInputOptions {
    placeholder?: string
    validator?: ScmInputValidator
}

export class ScmInput implements Disposable {

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    protected readonly onFocusEmitter = new Emitter<void>();
    readonly onFocus = this.onFocusEmitter.event;

    protected readonly toDispose = new DisposableCollection(
        this.onDidChangeEmitter,
        this.onFocusEmitter
    );

    constructor(
        protected readonly options: ScmInputOptions = {}
    ) { }

    dispose(): void {
        this.toDispose.dispose();
    }

    get placeholder(): string {
        return this.options.placeholder || '';
    }

    protected _value = '';
    get value(): string {
        return this._value;
    }
    set value(value: string) {
        if (this._value === value) {
            return;
        }
        this._value = value;
        this.onDidChangeEmitter.fire(undefined);
        this.validate();
    }

    protected _issue: ScmInputIssue | undefined;
    get issue(): ScmInputIssue | undefined {
        return this._issue;
    }
    set issue(issue: ScmInputIssue | undefined) {
        if (JSONExt.deepEqual(<JSONObject>(this._issue || {}), <JSONObject>(issue || {}))) {
            return;
        }
        this._issue = issue;
        this.onDidChangeEmitter.fire(undefined);
    }

    async validate(): Promise<void> {
        if (this.options.validator) {
            this.issue = await this.options.validator(this._value);
        }
    }

    focus(): void {
        this.onFocusEmitter.fire(undefined);
    }

}
