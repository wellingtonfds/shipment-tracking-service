# Graphify — grafo de conhecimento

Este repositório tem um grafo de conhecimento em `graphify-out/` (god nodes, comunidades, relações entre arquivos). Consultar o grafo é **obrigatório** antes de explorar o código com `grep`/`glob`/`read` amplo — ele retorna um subgrafo focado, muito menor que o output de grep bruto.

> `graphify-out/` está no `.gitignore`: o grafo é **local** e não vem no `git pull`/clone. Siga a seção "Pós-pull / clone" abaixo.

## Uso (duas formas equivalentes)

Forma slash (skill `/graphify`) e forma CLI são equivalentes — use a que estiver disponível:

| Objetivo | Slash | CLI |
| --- | --- | --- |
| Contexto amplo sobre o codebase | `/graphify query "<pergunta>"` | `graphify query "<pergunta>"` |
| Traçar um caminho específico | `/graphify query "<pergunta>" --dfs` | `graphify query "<pergunta>" --dfs` |
| Relação entre dois conceitos | `/graphify path "<A>" "<B>"` | `graphify path "<A>" "<B>"` |
| Explicação focada de um conceito | `/graphify explain "<conceito>"` | `graphify explain "<conceito>"` |

Regras de navegação:

- Se `graphify-out/wiki/index.md` existir, use-o para navegação ampla em vez de ler fontes diretamente.
- `graphify-out/GRAPH_REPORT.md` só para revisão arquitetural ampla, ou quando query/path/explain não trouxerem contexto suficiente.
- Arquivos dirty em `graphify-out/` após hooks ou updates incrementais são esperados — **não** é motivo para pular o graphify. Só pule se a tarefa for sobre output stale/incorreto do grafo, ou se o usuário pedir explicitamente.

## Pós-pull / clone (obrigatório)

Como `graphify-out/` não é versionado, após `git pull` ou um clone novo:

```bash
git pull
ls graphify-out/graph.json 2>/dev/null || /graphify .        # sem grafo → build completo
/graphify . --update    # com grafo → incremental: só re-extrai novos/alterados
```

Forma CLI equivalente:

```bash
git pull
ls graphify-out/graph.json 2>/dev/null || graphify .
graphify update .       # ≡ /graphify . --update (code-only = extração AST, sem custo LLM)
```

## Pós-modificação (obrigatório)

Após qualquer edição de código, mantenha o grafo atual:

```bash
/graphify . --update    # ≡ graphify update .
```

Nunca versione `graphify-out/` (já coberto pelo `.gitignore`).
