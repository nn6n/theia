// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

// @ts-check
describe('SCM', function () {

    const { assert } = chai;

    const { animationFrame } = require('@theia/core/lib/browser/browser');
    const { HostedPluginSupport } = require('@theia/plugin-ext/lib/hosted/browser/hosted-plugin');
    const Uri = require('@theia/core/lib/common/uri');
    const { ApplicationShell } = require('@theia/core/lib/browser/shell/application-shell');
    const { ContextKeyService } = require('@theia/core/lib/browser/context-key-service');
    const { ScmContribution } = require('@theia/scm/lib/browser/scm-contribution');
    const { ScmService } = require('@theia/scm/lib/browser/scm-service');
    const { ScmWidget } = require('@theia/scm/lib/browser/scm-widget');
    const { CommandRegistry } = require('@theia/core/lib/common');
    const { PreferenceService } = require('@theia/core/lib/browser');


    /** @type {import('inversify').Container} */
    const container = window['theia'].container;
    const contextKeyService = container.get(ContextKeyService);
    const scmContribution = container.get(ScmContribution);
    const shell = container.get(ApplicationShell);
    const service = container.get(ScmService);
    const commandRegistry = container.get(CommandRegistry);
    const pluginService = container.get(HostedPluginSupport);
    const preferences = container.get(PreferenceService);

    /** @type {ScmWidget} */
    let scmWidget;

    /** @type {ScmService} */
    let scmService;

    const gitPluginId = 'vscode.git';

    /**
         * @param {() => unknown} condition
         * @param {number | undefined} [timeout]
         * @param {string | undefined} [message]
         * @returns {Promise<void>}
         */
    function waitForAnimation(condition, timeout, message) {
        const success = new Promise(async (resolve, reject) => {
            if (timeout === undefined) {
                timeout = 100000;
            }

            let timedOut = false;
            const handle = setTimeout(() => {
                console.log(message);
                timedOut = true;
            }, timeout);

            do {
                await animationFrame();
            } while (!timedOut && !condition());
            if (timedOut) {
                reject(new Error(message ?? 'Wait for animation timed out.'));
            } else {
                clearTimeout(handle);
                resolve(undefined);
            }

        });
        return success;
    }


    before(async () => {
        preferences.set('git.autoRepositoryDetection', true);
        preferences.set('git.openRepositoryInParentFolders', 'always');
    });

    beforeEach(async () => {
        if (!pluginService.getPlugin(gitPluginId)) {
            throw new Error(gitPluginId + ' should be started');
        }
        await pluginService.activatePlugin(gitPluginId);
        await shell.leftPanelHandler.collapse();
        scmWidget = await scmContribution.openView({ activate: true, reveal: true });
        scmService = service;
        await waitForAnimation(() => scmService.selectedRepository, 10000, 'selected repository is not defined');
    });

    afterEach(() => {
        // @ts-ignore
        scmWidget = undefined;
        // @ts-ignore
        scmService = undefined;
    });

    describe('scm-view', () => {
        it('the view should open and activate successfully', () => {
            assert.notEqual(scmWidget, undefined);
            assert.strictEqual(scmWidget, shell.activeWidget);
        });

        describe('\'ScmTreeWidget\'', () => {

            it('the view should display the resource tree when a repository is present', () => {
                assert.isTrue(scmWidget.resourceWidget.isVisible);
            });

            it('the view should not display the resource tree when no repository is present', () => {

                // Store the current selected repository so it can be restored.
                const cachedSelectedRepository = scmService.selectedRepository;

                scmService.selectedRepository = undefined;
                assert.isFalse(scmWidget.resourceWidget.isVisible);

                // Restore the selected repository.
                scmService.selectedRepository = cachedSelectedRepository;
            });

        });

        describe('\'ScmNoRepositoryWidget\'', () => {

            it('should not be visible when a repository is present', () => {
                assert.isFalse(scmWidget.noRepositoryWidget.isVisible);
            });

            it('should be visible when no repository is present', () => {

                // Store the current selected repository so it can be restored.
                const cachedSelectedRepository = scmService.selectedRepository;

                scmService.selectedRepository = undefined;
                assert.isTrue(scmWidget.noRepositoryWidget.isVisible);

                // Restore the selected repository.
                scmService.selectedRepository = cachedSelectedRepository;
            });

        });
    });

    describe('scm-service', () => {

        it('should successfully return the list of repositories', () => {
            const repositories = scmService.repositories;
            assert.isTrue(repositories.length > 0);
        });

        it('should include the selected repository in the list of repositories', () => {
            const repositories = scmService.repositories;
            const selectedRepository = scmService.selectedRepository;
            assert.isTrue(repositories.length === 1);
            assert.strictEqual(repositories[0], selectedRepository);
        });

        it('should successfully return the selected repository', () => {
            assert.notEqual(scmService.selectedRepository, undefined);
        });

        it('should successfully find the repository', () => {
            const selectedRepository = scmService.selectedRepository;
            if (selectedRepository) {
                const rootUri = selectedRepository.provider.rootUri;
                const foundRepository = scmService.findRepository(new Uri.default(rootUri));
                assert.notEqual(foundRepository, undefined);
            }
            else {
                assert.fail('Selected repository is undefined');
            }
        });

        it('should not find a repository for an unknown uri', () => {
            const mockUri = new Uri.default('foobar/foo/bar');
            const repo = scmService.findRepository(mockUri);
            assert.strictEqual(repo, undefined);
        });

        it('should successfully return the list of statusbar commands', () => {
            assert.isTrue(scmService.statusBarCommands.length > 0);
        });

    });

    describe('scm-provider', () => {

        it('should successfully return the last commit', async () => {
            const selectedRepository = scmService.selectedRepository;
            if (selectedRepository) {
                const amendSupport = selectedRepository.provider.amendSupport;
                if (amendSupport) {
                    const commit = await amendSupport.getLastCommit();
                    assert.notEqual(commit, undefined);
                }
            }
            else {
                assert.fail('Selected repository is undefined');
            }
        });

    });

    describe('scm-contribution', () => {

        describe('scmFocus context-key', () => {

            it('should return \'true\' when the view is focused', () => {
                assert.isTrue(contextKeyService.match('scmFocus'));
            });

            it('should return \'false\' when the view is not focused', async () => {
                await scmContribution.closeView();
                assert.isFalse(contextKeyService.match('scmFocus'));
            });

        });
    });

});
