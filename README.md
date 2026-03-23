# Agent Slot - Guia de Inicialização

Este diretório é um "Agent Slot", um ambiente white-label focado em engenharia corporativa para um Engenheiro de Software Sênior.

## Como Inicializar

1. **Copie o diretório**: Mova a pasta `agent_slot` para o seu novo projeto.
2. **Preencha os Templates**:
   - Atualize `memory/IDENTITY.md` com a visão e o tipo do projeto.
   - Atualize `memory/ARCHITECTURE.md` com a stack tecnológica e padrões.
3. **Inicie o Agente**:
   - **Execute** o arquivo `SOUL.md` (evite apenas "analisar", use comandos como "Execute este arquivo" ou "Acione a soul").
   - O agente realizará automaticamente a limpeza de sua própria pasta `.git` e se registrará no `.gitignore` do Host.
   - O agente perguntará se você deseja ativar o **Hipocampo Vivo** (Memória Vetorial) e onde configurar o ambiente virtual.
   - Após as definições, o agente confirmará a prontidão: "Configuração do projeto [nome do projeto] pronto!"

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
