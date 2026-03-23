# Padrões de Engenharia

## 1. Controle de Versão (Git)
### Mensagens de Commit
- **Formato**: `<tipo>(<escopo>): <resumo curto>`
- **Tipos**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.
- **Escopo**: Seção da base de código afetada.

### Pull Requests
- Deve incluir um resumo conciso das alterações.
- Deve vincular ao issue/ticket relevante.
- Deve incluir um checklist de testes realizados.

## 2. Convenções de Código
- **Nomenclatura**: [ex: camelCase para variáveis, PascalCase para classes]
- **Formatação**: [ex: regras Prettier/ESLint]
- **Clean Code**: Evite aninhamentos profundos, priorize a legibilidade sobre a "esperteza" do código.

## 3. Requisitos de Teste
- **Testes Unitários**: Obrigatórios para funções com lógica densa.
- **Testes de Integração**: Exigidos para endpoints de API.
- **Mínimo de Cobertura**: [ex: 80%]

## 4. Documentação
- Todas as APIs públicas devem ser documentadas.
- Lógicas complexas devem ter comentários explicativos sobre o "porquê", não o "como".
