// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { getJsonOfText, getTextOfResponse, LanguageModelRequirement, LanguageModelResponse } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import { AbstractStreamParsingChatAgent, ChatSessionContext } from '@theia/ai-chat/lib/common/chat-agents';
import { MutableChatRequestModel, InformationalChatResponseContentImpl } from '@theia/ai-chat/lib/common/chat-model';
import { generateUuid, nls } from '@theia/core';
import { ChatHistoryEntry } from '@theia/ai-chat/lib/common/chat-history-entry';

import { orchestratorTemplate } from './orchestrator-prompt-template';

export const OrchestratorChatAgentId = 'Orchestrator';
const OrchestratorRequestIdKey = 'orchestatorRequestIdKey';

@injectable()
export class OrchestratorChatAgent extends AbstractStreamParsingChatAgent {
    id: string = OrchestratorChatAgentId;
    name = OrchestratorChatAgentId;
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'agent-selection',
        identifier: 'openai/gpt-4o',
    }];
    protected defaultLanguageModelPurpose: string = 'agent-selection';

    override variables = ['chatAgents'];
    override promptTemplates = [orchestratorTemplate];
    override description = nls.localize('theia/ai/chat/orchestrator/description',
        'This agent analyzes the user request against the description of all available chat agents and selects the best fitting agent to answer the request \
    (by using AI).The user\'s request will be directly delegated to the selected agent without further confirmation.');
    override iconClass: string = 'codicon codicon-symbol-boolean';

    protected override defaultLogging = false;
    protected override systemPromptId: string = orchestratorTemplate.id;

    private fallBackChatAgentId = 'Universal';

    @inject(ChatAgentService)
    protected chatAgentService: ChatAgentService;

    override async invoke(request: MutableChatRequestModel): Promise<void> {
        request.response.addProgressMessage({ content: 'Determining the most appropriate agent', status: 'inProgress' });
        // We generate a dedicated ID for recording the orchestrator request/response, as we will forward the original request to another agent
        const orchestratorRequestId = generateUuid();
        request.addData(OrchestratorRequestIdKey, orchestratorRequestId);
        const messages = await this.getMessages(request.session);
        const systemMessage = (await this.getSystemMessageDescription({ model: request.session, request } satisfies ChatSessionContext))?.text;
        this.recordingService.recordRequest(
            ChatHistoryEntry.fromRequest(this.id, request, {
                requestId: orchestratorRequestId,
                messages,
                systemMessage
            })
        );
        return super.invoke(request);
    }

    protected override async addContentsToResponse(response: LanguageModelResponse, request: MutableChatRequestModel): Promise<void> {
        let agentIds: string[] = [];
        const responseText = await getTextOfResponse(response);
        // We use the previously generated, dedicated ID to log the orchestrator response before we forward the original request
        const orchestratorRequestId = request.getDataByKey(OrchestratorRequestIdKey);
        if (typeof orchestratorRequestId === 'string') {
            this.recordingService.recordResponse({
                agentId: this.id,
                sessionId: request.session.id,
                requestId: orchestratorRequestId,
                response: responseText,
            });
        }
        try {
            const jsonResponse = await getJsonOfText(responseText);
            if (Array.isArray(jsonResponse)) {
                agentIds = jsonResponse.filter((id: string) => id !== this.id);
            }
        } catch (error: unknown) {
            // The llm sometimes does not return a parseable result
            this.logger.error('Failed to parse JSON response', error);
        }

        if (agentIds.length < 1) {
            this.logger.error('No agent was selected, delegating to fallback chat agent');
            request.response.progressMessages.forEach(progressMessage =>
                request.response.updateProgressMessage({ ...progressMessage, status: 'failed' })
            );
            agentIds = [this.fallBackChatAgentId];
        }

        // check if selected (or fallback) agent exists
        if (!this.chatAgentService.getAgent(agentIds[0])) {
            this.logger.error(`Chat agent ${agentIds[0]} not found. Falling back to first registered agent.`);
            const firstRegisteredAgent = this.chatAgentService.getAgents().filter(a => a.id !== this.id)[0]?.id;
            if (firstRegisteredAgent) {
                agentIds = [firstRegisteredAgent];
            } else {
                throw new Error('No chat agent available to handle request. Please check your configuration whether any are enabled.');
            }
        }

        // TODO support delegating to more than one agent
        const delegatedToAgent = agentIds[0];
        request.response.response.addContent(new InformationalChatResponseContentImpl(
            `*Orchestrator*: Delegating to \`@${delegatedToAgent}\`
            
            ---

            `
        ));
        request.response.overrideAgentId(delegatedToAgent);
        request.response.progressMessages.forEach(progressMessage =>
            request.response.updateProgressMessage({ ...progressMessage, status: 'completed' })
        );
        const agent = this.chatAgentService.getAgent(delegatedToAgent);
        if (!agent) {
            throw new Error(`Chat agent ${delegatedToAgent} not found.`);
        }
        await agent.invoke(request);
    }
}
