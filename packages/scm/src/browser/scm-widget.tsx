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

import * as React from 'react';
import { Message } from '@phosphor/messaging';
import { ElementExt } from '@phosphor/domutils';
import { injectable, inject, postConstruct } from 'inversify';
import { ApplicationShell, ContextMenuRenderer, SELECTED_CLASS, StorageService, ReactWidget, Key } from '@theia/core/lib/browser';
import { AlertMessage } from '@theia/core/lib/browser/widgets/alert-message';
import { ScmInput, ScmRepository, ScmResource, ScmResourceGroup, ScmService } from './scm-service';
import { CommandRegistry, MenuPath } from '@theia/core';
import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';
import { ScmAvatarService } from './scm-avatar-service';
import { ScmTitleCommandRegistry, ScmTitleItem } from './scm-title-command-registry';
import { ScmResourceCommandRegistry, ScmResourceItem } from './scm-resource-command-registry';
import { ScmGroupCommandRegistry, ScmGroupItem } from './scm-group-command-registry';
import { ScmAmendComponent } from './scm-amend-component';

@injectable()
export class ScmWidget extends ReactWidget {
    private static MESSAGE_BOX_MIN_HEIGHT = 25;
    private static LABEL = 'Source Control';

    protected messageBoxHeight: number = ScmWidget.MESSAGE_BOX_MIN_HEIGHT;

    @inject(ScmTitleCommandRegistry) protected readonly scmTitleRegistry: ScmTitleCommandRegistry;
    @inject(ScmResourceCommandRegistry) protected readonly scmResourceCommandRegistry: ScmResourceCommandRegistry;
    @inject(ScmGroupCommandRegistry) protected readonly scmGroupCommandRegistry: ScmGroupCommandRegistry;
    @inject(ScmService) private readonly scmService: ScmService;
    @inject(CommandRegistry) private readonly commands: CommandRegistry;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer;
    @inject(ScmAvatarService) protected readonly avatarService: ScmAvatarService;
    @inject(StorageService) protected readonly storageService: StorageService;

    private _scrollContainer: string;
    protected set scrollContainer(id: string) {
        this._scrollContainer = id + Date.now();
    }
    protected get scrollContainer(): string {
        return this._scrollContainer;
    }

    constructor() {
        super();
        this.node.tabIndex = 0;
        this.id = 'theia-scmContainer';
        this.addClass('theia-scm');
        this.scrollContainer = ScmWidget.Styles.GROUPS_CONTAINER;

        this.title.iconClass = 'scm-tab-icon';
        this.title.label = ScmWidget.LABEL;
        this.title.caption = ScmWidget.LABEL;
        this.title.closable = true;
    }

    @postConstruct()
    protected init(): void {
        this.refresh();
        this.toDispose.push(this.scmService.onDidChangeSelectedRepository(() => this.refresh()));
    }

    protected readonly toDisposeOnRefresh = new DisposableCollection();
    protected refresh(): void {
        this.toDisposeOnRefresh.dispose();
        this.toDispose.push(this.toDisposeOnRefresh);
        const repository = this.scmService.selectedRepository;
        this.title.label = ScmWidget.LABEL;
        if (repository) {
            this.title.label += ': ' + repository.provider.contextValue;
        }
        const area = this.shell.getAreaFor(this);
        if (area === 'left') {
            this.shell.leftPanelHandler.refresh();
        } else if (area === 'right') {
            this.shell.rightPanelHandler.refresh();
        }
        this.update();
        if (repository) {
            this.toDisposeOnRefresh.push(repository.onDidChange(() => this.update()));
        }
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.update();
        this.node.focus();
    }

    protected onUpdateRequest(msg: Message): void {
        if (!this.isAttached || !this.isVisible) {
            return;
        }
        this.onRender.push(Disposable.create(() => async () => {
            const selected = this.node.getElementsByClassName(SELECTED_CLASS)[0];
            if (selected) {
                ElementExt.scrollIntoViewIfNeeded(this.node, selected);
            }
        }));
        super.onUpdateRequest(msg);
    }

    protected addScmListKeyListeners = (id: string) => {
        const container = document.getElementById(id);
        if (container) {
            this.addScmListNavigationKeyListeners(container);
        }
    }

    protected render(): React.ReactNode {
        const repository = this.scmService.selectedRepository;
        if (!repository) {
            return <AlertMessage
                type='WARNING'
                header='Source control is not available at this time'
            />;
        }
        const input = repository.input;
        const amendSupport = repository.provider.amendSupport;

        return <div className={ScmWidget.Styles.MAIN_CONTAINER}>
            <div className='headerContainer' style={{ flexGrow: 0 }}>
                {this.renderInput(input, repository)}
                {this.renderCommandBar(repository)}
            </div>
            <ScmResourceGroupsContainer
                style={{ flexGrow: 1 }}
                id={this.scrollContainer}
                repository={repository}
                scmResourceCommandRegistry={this.scmResourceCommandRegistry}
                scmGroupCommandRegistry={this.scmGroupCommandRegistry}
                commands={this.commands}
                addScmListKeyListeners={this.addScmListKeyListeners}
                renderContextMenu={this.showMoreToolButtons}
            />
            {amendSupport && <ScmAmendComponent
                key={`amend:${repository.provider.rootUri}`}
                style={{ flexGrow: 0 }}
                id={this.scrollContainer}
                repository={repository}
                scmAmendSupport={amendSupport}
                setCommitMessage={this.setInputValue}
                avatarService={this.avatarService}
                storageService={this.storageService}
            />}
        </div>;
    }

    protected renderInput(input: ScmInput, repository: ScmRepository): React.ReactNode {
        const validationStatus = input.issue ? input.issue.type : 'idle';
        const validationMessage = input.issue ? input.issue.message : '';
        const keyBinding = navigator.appVersion.indexOf('Mac') !== -1 ? 'Cmd+Enter' : 'Ctrl+Enter';
        // tslint:disable-next-line:no-any
        const format = (value: string, ...args: string[]): string => {
            if (args.length !== 0) {
                return value.replace(/{(\d+)}/g, (found, n) => {
                    const i = parseInt(n);
                    return isNaN(i) || i < 0 || i >= args.length ? found : args[i];
                });
            }
            return value;
        };
        const message = format(input.placeholder, keyBinding);
        return <div className={ScmWidget.Styles.INPUT_MESSAGE_CONTAINER}>
            <textarea
                className={`${ScmWidget.Styles.INPUT_MESSAGE} theia-scm-input-message-${validationStatus}`}
                style={{
                    height: this.messageBoxHeight,
                    overflow: this.messageBoxHeight > ScmWidget.MESSAGE_BOX_MIN_HEIGHT ? 'auto' : 'hidden'
                }}
                autoFocus={true}
                onInput={this.setInputValue}
                placeholder={message}
                id={ScmWidget.Styles.INPUT_MESSAGE}
                defaultValue={input.value}
                onKeyPress={this.executeInputCommand}
                tabIndex={1}>
            </textarea>
            <div
                className={
                    `${ScmWidget.Styles.VALIDATION_MESSAGE} ${ScmWidget.Styles.NO_SELECT}
                    theia-scm-validation-message-${validationStatus} theia-scm-input-message-${validationStatus}`
                }
                style={{
                    display: !!input.issue ? 'block' : 'none'
                }}>{validationMessage}</div>
        </div>;
    }

    protected setInputValue = (event: React.FormEvent<HTMLTextAreaElement> | string) => {
        const repository = this.scmService.selectedRepository;
        if (repository) {
            repository.input.value = typeof event === 'string' ? event : event.currentTarget.value;
        }
        if (typeof event !== 'string') {
            this.resize(event.currentTarget);
        }
    }

    protected renderCommandBar(repository: ScmRepository | undefined): React.ReactNode {
        const { commands, scmService } = this;
        return <div id='commandBar' className='flexcontainer'>
            <div className='buttons'>
                {this.scmTitleRegistry.getItems().map(item => <ScmTitleItemComponent {...{ item, commands, scmService }} />)}
                <a className='toolbar-button' title='More...' onClick={this.showMoreToolButtons}>
                    <i className='fa fa-ellipsis-h' />
                </a>
            </div>
            <div className='placeholder' />
            {this.renderInputCommand(repository)}
        </div>;
    }

    protected showMoreToolButtons = (event: React.MouseEvent<HTMLElement>, group?: string[]) => {
        const parent = event.currentTarget.parentElement;
        if (parent) {
            const rect = parent.getBoundingClientRect();
            this.contextMenuRenderer.render(group || ScmWidget.ContextMenu.PATH, {
                x: rect.left,
                y: rect.top + parent.offsetHeight
            });
        }
    }

    protected renderInputCommand(repository: ScmRepository | undefined): React.ReactNode {
        const command = repository && repository.provider.acceptInputCommand;
        return command && <div className='buttons'>
            <button className='theia-button' onClick={this.executeInputCommand} title={command.tooltip}>
                {command.text}
            </button>
        </div>;
    }

    protected executeInputCommand = async (event: React.KeyboardEvent | React.MouseEvent) => {
        if ('key' in event && !(event.key === 'Enter' && event.ctrlKey)) {
            return;
        }
        const repository = this.scmService.selectedRepository;
        if (!repository) {
            return;
        }
        const command = repository.provider.acceptInputCommand;
        if (!command) {
            return;
        }
        repository.input.issue = undefined;
        if (!repository.input.value.trim()) {
            repository.input.issue = {
                type: 'error',
                message: 'Please provide an input'
            };
        }
        if (!repository.input.issue) {
            await this.commands.executeCommand(command.id, repository.provider.handle);
            repository.input.value = '';
        } else {
            repository.input.focus();
        }
    }

    protected resize(textArea: HTMLTextAreaElement): void {
        // tslint:disable-next-line:no-null-keyword
        const fontSize = Number.parseInt(window.getComputedStyle(textArea, undefined).getPropertyValue('font-size').split('px')[0] || '0', 10);
        const { value } = textArea;
        if (Number.isInteger(fontSize) && fontSize > 0) {
            const requiredHeight = fontSize * value.split(/\r?\n/).length;
            if (requiredHeight < textArea.scrollHeight) {
                textArea.style.height = `${requiredHeight}px`;
            }
        }
        if (textArea.clientHeight < textArea.scrollHeight) {
            textArea.style.height = `${textArea.scrollHeight}px`;
            if (textArea.clientHeight < textArea.scrollHeight) {
                textArea.style.height = `${(textArea.scrollHeight * 2 - textArea.clientHeight)}px`;
            }
        }
        const updatedHeight = textArea.style.height;
        if (updatedHeight) {
            this.messageBoxHeight = parseInt(updatedHeight, 10) || ScmWidget.MESSAGE_BOX_MIN_HEIGHT;
            if (this.messageBoxHeight > ScmWidget.MESSAGE_BOX_MIN_HEIGHT) {
                textArea.style.overflow = 'auto';
            } else {
                // Hide the scroll-bar if we shrink down the size.
                textArea.style.overflow = 'hidden';
            }
        }
    }

    protected addScmListNavigationKeyListeners(container: HTMLElement): void {
        this.addKeyListener(container, Key.ARROW_LEFT, () => this.navigateLeft());
        this.addKeyListener(container, Key.ARROW_RIGHT, () => this.navigateRight());
        this.addKeyListener(container, Key.ARROW_UP, () => this.selectPreviousResource());
        this.addKeyListener(container, Key.ARROW_DOWN, () => this.selectNextResource());
        this.addKeyListener(container, Key.ENTER, () => this.handleEnter());
    }

    protected navigateLeft(): void {
        const resource = this.selectPreviousResource();
        if (resource) {
            resource.open();
        }
    }

    protected navigateRight(): void {
        const resource = this.selectNextResource();
        if (resource) {
            resource.open();
        }
    }

    protected selectPreviousResource(): ScmResource | undefined {
        const repository = this.scmService.selectedRepository;
        return repository && repository.selectPreviousResource();
    }

    protected selectNextResource(): ScmResource | undefined {
        const repository = this.scmService.selectedRepository;
        return repository && repository.selectNextResource();
    }

    protected handleEnter(): void {
        const repository = this.scmService.selectedRepository;
        const resource = repository && repository.selectedResource;
        if (resource) {
            const items = this.scmResourceCommandRegistry.getItems(resource.group.label);
            if (items && items.length > 0) {
                this.commands.executeCommand(items[0].command, resource.sourceUri.toString());
            }
        }
    }

}

export namespace ScmWidget {

    export namespace Styles {
        export const MAIN_CONTAINER = 'theia-scm-main-container';
        export const PROVIDER_CONTAINER = 'theia-scm-provider-container';
        export const PROVIDER_NAME = 'theia-scm-provider-name';
        export const GROUPS_CONTAINER = 'groups-outer-container';
        export const INPUT_MESSAGE_CONTAINER = 'theia-scm-input-message-container';
        export const INPUT_MESSAGE = 'theia-scm-input-message';
        export const VALIDATION_MESSAGE = 'theia-scm-input-validation-message';
        export const NO_SELECT = 'no-select';
    }

    export namespace ContextMenu {
        export const PATH: MenuPath = ['scm-widget-context-menu'];
        export const INPUT_GROUP: MenuPath = [...PATH, '1_input'];
        export const FIRST_GROUP: MenuPath = [...PATH, '2_other'];
        export const SECOND_GROUP: MenuPath = [...PATH, '3_other'];
        export const BATCH: MenuPath = [...PATH, '3_batch'];
    }
}

export class ScmResourceComponent extends React.Component<ScmResourceComponent.Props> {
    render() {
        const { name, path, icon, letter, color } = this.props;
        const style = {
            color
        };
        const tooltip = this.props.resource.decorations ? this.props.resource.decorations.tooltip : '';
        return <div className={`scmItem ${ScmWidget.Styles.NO_SELECT}${this.props.resource.selected ? ' ' + SELECTED_CLASS : ''}`}
            onContextMenu={this.renderContextMenu}>
            <div className='noWrapInfo' onDoubleClick={this.open} onClick={this.selectChange}>
                <span className={icon + ' file-icon'} />
                <span className='name'>{name}</span>
                <span className='path'>{path}</span>
            </div>
            <div className='itemButtonsContainer'>
                {this.renderScmItemButtons()}
                <div title={tooltip} className='status' style={style}>
                    {letter}
                </div>
            </div>
        </div>;
    }

    protected open = async () => {
        await this.props.resource.open();
    }

    protected readonly selectChange = () => this.props.selectChange(this.props.resource);

    protected renderContextMenu = (event: React.MouseEvent<HTMLElement>) => {
        event.preventDefault();
        this.props.renderContextMenu(event, ['scm-resource-context-menu_' + this.props.groupId]);
    }

    protected renderScmItemButtons(): React.ReactNode {
        const { resource, commands, scmResourceCommandRegistry, groupId } = this.props;
        const items = scmResourceCommandRegistry.getItems(groupId);
        return items && <div className='buttons'>
            {items.map(item => <ResourceItemComponent {...{ item, resource, commands }} />)}
        </div>;
    }

}
export namespace ScmResourceComponent {
    export interface Props {
        name: string,
        path: string,
        icon: string,
        letter: string,
        color: string,
        resource: ScmResource,
        groupLabel: string,
        groupId: string,
        scmResourceCommandRegistry: ScmResourceCommandRegistry,
        commands: CommandRegistry,
        selectChange: (change: ScmResource) => void,
        renderContextMenu: (event: React.MouseEvent<HTMLElement>, group: string[]) => void
    }
}

export class ScmResourceGroupsContainer extends React.Component<ScmResourceGroupsContainer.Props> {
    render() {
        const { groups } = this.props.repository.provider;
        return <div className={ScmWidget.Styles.GROUPS_CONTAINER} style={this.props.style} id={this.props.id} tabIndex={2}>
            {groups && this.props.repository.provider.groups.map(group => this.renderGroup(group))}
        </div>;
    }

    protected renderGroup(group: ScmResourceGroup): React.ReactNode {
        return group.resources.length && <ScmResourceGroupContainer
            group={group}
            key={group.id}
            scmResourceCommandRegistry={this.props.scmResourceCommandRegistry}
            scmGroupCommandRegistry={this.props.scmGroupCommandRegistry}
            selectChange={this.selectChange}
            renderContextMenu={this.props.renderContextMenu}
            commands={this.props.commands} />;
    }

    protected selectChange = (resource: ScmResource) => {
        this.props.repository.selectedResource = resource;
    }

    componentDidMount() {
        this.props.addScmListKeyListeners(this.props.id);
    }
}
export namespace ScmResourceGroupsContainer {
    export interface Props {
        id: string,
        style: React.CSSProperties | undefined,
        repository: ScmRepository,
        scmResourceCommandRegistry: ScmResourceCommandRegistry,
        scmGroupCommandRegistry: ScmGroupCommandRegistry,
        commands: CommandRegistry
        addScmListKeyListeners: (id: string) => void
        renderContextMenu: (event: React.MouseEvent<HTMLElement>, group: string[] | undefined) => void
    }
}

export class ScmResourceGroupContainer extends React.Component<ScmResourceGroupContainer.Props> {
    render() {
        const group = this.props.group;
        return <div className='changesContainer' key={group.id}>
            <div className='theia-header scm-theia-header' onContextMenu={this.showContextMenu}>
                <div className='noWrapInfo'>{group.label}</div>
                {this.renderGroupButtons()}
                {this.renderChangeCount()}
            </div>
            <div>{group.resources.map(resource => this.renderScmResourceItem(resource))}</div>
        </div>;
    }

    protected showContextMenu = (event: React.MouseEvent<HTMLElement>) => {
        event.preventDefault();
        this.props.renderContextMenu(event, ['scm-group-context-menu_' + this.props.group.id]);
    }

    protected renderChangeCount(): React.ReactNode {
        const changeCount = this.props.group.resources.length;
        return changeCount && <div className='notification-count-container scm-change-count'>
            <span className='notification-count'>{changeCount}</span>
        </div>;
    }

    protected renderGroupButtons(): React.ReactNode {
        const { group, commands } = this.props;
        const items = this.props.scmGroupCommandRegistry.getItems(group.id);
        return items && <div className='scm-change-list-buttons-container'>
            {items.map(item => <ScmGroupItemComponent {...{ item, group, commands }} />)}
        </div>;
    }

    protected renderScmResourceItem(resource: ScmResource): React.ReactNode {
        const repoUri = resource.group.provider.rootUri;
        if (!repoUri) {
            return undefined;
        }
        const decorations = resource.decorations;
        const uri = resource.sourceUri.path.toString();
        const project = repoUri.substring(repoUri.lastIndexOf('/') + 1);
        const name = uri.substring(uri.lastIndexOf('/') + 1) + ' ';
        // TODO use LabelProvider instead
        const path = uri.substring(uri.lastIndexOf(project) + project.length + 1, uri.lastIndexOf('/'));
        return <ScmResourceComponent key={`${resource.sourceUri}`}
            name={name}
            path={path.length > 1 ? path : ''}
            icon={(decorations && decorations.icon) ? decorations.icon : ''}
            color={(decorations && decorations.color) ? decorations.color : ''}
            letter={(decorations && decorations.letter) ? decorations.letter : ''}
            resource={resource}
            groupLabel={this.props.group.label}
            groupId={this.props.group.id}
            commands={this.props.commands}
            scmResourceCommandRegistry={this.props.scmResourceCommandRegistry}
            selectChange={this.props.selectChange}
            renderContextMenu={this.props.renderContextMenu}
        />;
    }
}
export namespace ScmResourceGroupContainer {
    export interface Props {
        group: ScmResourceGroup
        scmResourceCommandRegistry: ScmResourceCommandRegistry
        scmGroupCommandRegistry: ScmGroupCommandRegistry
        commands: CommandRegistry;
        selectChange: (change: ScmResource) => void
        renderContextMenu: (event: React.MouseEvent<HTMLElement>, group: string[]) => void
    }
}

export class ScmTitleItemComponent extends React.Component<ScmTitleItemComponent.Props> {

    render(): React.ReactNode {
        const { item, commands } = this.props;
        const command = commands.getCommand(item.command);
        return command && this.when() && item.group && item.group === 'navigation' && <a className='toolbar-button' key={command.id}>
            <i className={command.iconClass} title={command.label} onClick={this.execute} />
        </a>;
    }

    protected when(): boolean {
        const { item, scmService } = this.props;
        if (!item.when) {
            return true;
        }
        // TODO replace with `scmProvider` key and with proper evaluation
        const provider = item.when.substring(item.when.indexOf('scmProvider == ') + 'scmProvider == '.length).trim();
        const repository = scmService.selectedRepository;
        return !!repository && provider.toLowerCase() === repository.provider.label.toLowerCase();
    }

    protected execute = () => this.props.commands.executeCommand(this.props.item.command);

}
export namespace ScmTitleItemComponent {
    export interface Props {
        item: ScmTitleItem;
        scmService: ScmService;
        commands: CommandRegistry;
    }
}

export class ScmGroupItemComponent extends React.Component<ScmGroupItemComponent.Props> {
    render(): React.ReactNode {
        const { item, commands } = this.props;
        const command = commands.getCommand(item.command);
        return command && item.group && item.group === 'inline' && <a className='toolbar-button' key={command.id}>
            <i className={command.iconClass} title={command.label} onClick={this.execute} />
        </a>;
    }

    protected execute = () => {
        const { item, group, commands } = this.props;
        commands.executeCommand(item.command, {
            id: 2,
            groupHandle: group.handle,
            sourceControlHandle: group.sourceControlHandle
        });
    }

}
export namespace ScmGroupItemComponent {
    export interface Props {
        item: ScmGroupItem;
        group: ScmResourceGroup;
        commands: CommandRegistry;
    }
}

export class ResourceItemComponent extends React.Component<ResourceItemComponent.Props> {
    render(): React.ReactNode {
        const { item, commands } = this.props;
        const command = commands.getCommand(item.command);
        return command && <div className='toolbar-button' key={command.id}>
            <a className={command.iconClass} title={command.label} onClick={this.execute} />
        </div>;
    }

    protected execute = () => {
        const { item, resource, commands } = this.props;
        commands.executeCommand(item.command, {
            id: 3,
            handle: resource.handle,
            groupHandle: resource.groupHandle,
            sourceControlHandle: resource.sourceControlHandle,
            uri: resource.sourceUri.toString()
        });
    }

}
export namespace ResourceItemComponent {
    export interface Props {
        item: ScmResourceItem;
        resource: ScmResource;
        commands: CommandRegistry;
    }
}
