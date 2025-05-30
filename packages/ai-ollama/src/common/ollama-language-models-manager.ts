// *****************************************************************************
// Copyright (C) 2024 TypeFox GmbH.
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

export const OLLAMA_LANGUAGE_MODELS_MANAGER_PATH = '/services/ollama/language-model-manager';
export const OllamaLanguageModelsManager = Symbol('OllamaLanguageModelsManager');

export interface OllamaModelDescription {
    /**
     * The identifier of the model which will be shown in the UI.
     */
    id: string;
    /**
     * The name or ID of the model in the Ollama environment.
     */
    model: string;
}

export interface OllamaLanguageModelsManager {
    host: string | undefined;
    setHost(host: string | undefined): void;
    createOrUpdateLanguageModels(...models: OllamaModelDescription[]): Promise<void>;
    removeLanguageModels(...modelIds: string[]): void;
}
