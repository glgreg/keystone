# Agent Slot - Guia de Inicialização

Este diretório é um "Agent Slot", um ambiente white-label focado em engenharia corporativa para um Engenheiro de Software Sênior.

## Como Inicializar

1. **Copie o diretório**: Mova a pasta `agent_slot` para o seu novo projeto.
2. **Preencha os Templates**:
   - Atualize `memory/IDENTITY.md` com a visão e o tipo do projeto.
   - Atualize `memory/ARCHITECTURE.md` com a stack tecnológica e padrões.
3. **Inicie o Agente**:
   - Mencione o arquivo `SOUL.md` para o agente.
   - O agente realizará automaticamente a limpeza de sua própria pasta `.git` e tentará se registrar no `.gitignore` do Host.
   - Pergunte: "Analise o slot do projeto e realize a varredura inicial."
   - O agente confirmará a prontidão com a mensagem: "Configuração do projeto [nome do projeto] pronto, posso atualizar a pasta agent_slot para [nome dado para o agente] ou docs/?"

## Funcionalidades
- **Postura Sênior Estrita**: Guardião da integridade arquitetural.
- **Perfeição no Git**: Força commits atômicos com prefixos e PRs estruturados.
- **Segurança Primeiro**: Guard rails integrados para ambientes corporativos.
- **Memória Viva (Vector Engine)**: Sincronização automática da codebase para busca semântica e persistência de contexto através de `tools/memory/`.
- **Auto-Melhoria**: Aprende com a base de código e a interação do usuário.

## Configuração da Memória
Para habilitar a Memória Viva, certifique-se de que as dependências (`chromadb`) estão instaladas e execute:
```bash
python tools/memory/code_indexer.py
```
Isso criará a base vetorial em `memory/chroma_db` e permitirá que o agente consulte o projeto inteiro instantaneamente.

---
*Senior Engineering Framework - v1.1*
