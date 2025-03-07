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
import { MaybePromise, nls } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { AIVariable, ResolvedAIVariable, AIVariableContribution, AIVariableResolver, AIVariableService, AIVariableResolutionRequest, AIVariableContext } from './variable-service';

export namespace TodayVariableArgs {
    export const IN_UNIX_SECONDS = 'inUnixSeconds';
    export const IN_ISO_8601 = 'inIso8601';
}

export const TODAY_VARIABLE: AIVariable = {
    id: 'today-provider',
    description: nls.localize('theia/ai/core/todayVariable/description', 'Does something for today'),
    name: 'today',
    args: [
        {
            name: 'Format',
            description: nls.localize('theia/ai/core/todayVariable/format/description', 'The format of the date'),
            enum: [TodayVariableArgs.IN_ISO_8601, TodayVariableArgs.IN_UNIX_SECONDS],
            isOptional: true
        }
    ]
};

export interface ResolvedTodayVariable extends ResolvedAIVariable {
    date: Date;
}

@injectable()
export class TodayVariableContribution implements AIVariableContribution, AIVariableResolver {
    registerVariables(service: AIVariableService): void {
        service.registerResolver(TODAY_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): MaybePromise<number> {
        return 1;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        if (request.variable.name === TODAY_VARIABLE.name) {
            return this.resolveTodayVariable(request);
        }
        return undefined;
    }

    private resolveTodayVariable(request: AIVariableResolutionRequest): ResolvedTodayVariable {
        const date = new Date();
        if (request.arg === TodayVariableArgs.IN_ISO_8601) {
            return { variable: request.variable, value: date.toISOString(), date };
        }
        if (request.arg === TodayVariableArgs.IN_UNIX_SECONDS) {
            return { variable: request.variable, value: Math.round(date.getTime() / 1000).toString(), date };
        }
        return { variable: request.variable, value: date.toDateString(), date };
    }
}

