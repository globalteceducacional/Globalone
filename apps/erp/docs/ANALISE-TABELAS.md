# Análise das tabelas de itens no ERP Globaltec

Documento gerado a partir da análise do frontend. Lista onde existem tabelas, padrões usados e inconsistências.

---

## Onde existem tabelas

| Página / contexto | Arquivo | Quantidade | Descrição |
|-------------------|---------|------------|-----------|
| **Projetos** | `Projects.tsx` | 1 | Lista de projetos (Nome, Status, Progresso, Supervisor, Valor Total, Ações) |
| **Usuários** | `Users.tsx` | 1 | Lista de usuários (Nome, E-mail, Cargo, Status, Ações) |
| **Cargos** | `Cargos.tsx` | 1 | Lista de cargos (Nome, Nível, Descrição, Usuários, Status, Ações) |
| **Categorias** | `Categories.tsx` | 1 | Lista de categorias (Nome, Descrição, Status, Ações) |
| **Fornecedores** | `Suppliers.tsx` | 1 | Lista de fornecedores (Razão Social, Nome Fantasia, CNPJ, Endereço, Contato, Status, Ações) |
| **Compras & Estoque** | `Stock.tsx` | 3 | **Estoque**: itens (Item, Qtd. Total, Aloc., Disp., Ações). **Compras**: compras (checkbox, Item, Qtd, Cotações, Categoria, Solicitado Por, Status, Entrega, Ações). **Solicitações**: solicitações (Item, Quantidade, Solicitado Por, Projeto, Status, Ações) |
| **Requerimentos** | `Communications.tsx` | 1 | Lista de requerimentos (Tipo, Mensagem, Usuário, Status, Resposta, Ações) |
| **Detalhe do Projeto** | `ProjectDetails.tsx` | 1 | Tabela de compras do projeto (Item, Quantidade, Valor Unitário, Total, Status) |

**Total: 10 tabelas** em 8 arquivos.

---

## Padrões atuais

### 1. Wrapper da tabela

- **Padrão mais usado:**  
  `div` com `overflow-x-auto rounded-xl border border-white/10` → tabela com scroll horizontal e borda arredondada.
- **Exceções:**
  - **Communications:** wrapper `bg-neutral/80 border border-white/10 rounded-xl overflow-hidden` (sem `overflow-x-auto` no wrapper; a tabela está dentro).
  - **ProjectDetails:** só `overflow-x-auto` (sem `rounded-xl` nem `border border-white/10`).

### 2. Tabela

- Quase todas: `className="min-w-full text-sm"`.
- **Stock (Estoque):** `table-fixed sm:table-auto` para melhorar colunas em telas pequenas.

### 3. Cabeçalho (`thead`)

- **Padrão:** `thead className="bg-white/5 text-white/70"`.
- **th:** `px-4 py-3 text-left` (ou `text-right` para Ações).
- **Stock (Estoque):** cabeçalhos abreviados em mobile (Qtd. Total, Aloc., Disp.) e `min-w-*` em algumas colunas.

### 4. Linhas (`tr`)

- **Padrão:** `className="border-t border-white/5 hover:bg-white/5"` (alguns com `transition-colors`).
- **Communications:** `hover:bg-white/10`.
- **Stock (Solicitações):** linha com `bg-yellow-500/10`.

### 5. Células (`td`)

- **Padrão:** `px-4 py-3`.
- **ProjectDetails:** `px-4 py-2` (menos padding).
- Texto longo: em várias telas usa `truncate` + `title` ou `max-w-[...] truncate` (ex.: Categorias, Fornecedores, Stock).

### 6. Status (badge)

- Cores variam: `bg-green-500/20 text-green-300`, `bg-success/20 text-success`, `bg-warning/20 text-warning`, `bg-danger/20 text-danger`, etc.
- Formato comum: `px-2 py-1 rounded text-xs font-medium` (ou `inline-block`).

### 7. Botões de ação

- Alguns usam `buttonStyles.edit` / `buttonStyles.danger` (Cargos, Fornecedores, Users).
- Outros usam classes manuais (Categorias, Stock).
- Padrão de layout: `flex items-center justify-end gap-1.5 flex-wrap` (ou `gap-2`).

---

## Inconsistências

1. **Communications:** wrapper diferente (`bg-neutral/80`, sem `overflow-x-auto` no mesmo nível) e sem `rounded-xl`/borda no wrapper da tabela.
2. **ProjectDetails:** tabela sem `rounded-xl border border-white/10` no wrapper; `py-2` em vez de `py-3` nas células.
3. **Cores de status:** mistura de cores literais (`green-500/20`, `yellow-500/20`) e tokens (`success`, `warning`, `danger`).
4. **Responsividade:** só a tabela de **Estoque** em Stock tem tratamento específico para mobile (abreviações, `table-fixed`, `min-w-*`). As outras não têm cabeçalhos abreviados nem larguras mínimas por coluna.
5. **Truncar texto:** Categorias e Fornecedores usam `truncate` e `max-w-[...]` em colunas longas; Users, Cargos e Projects não aplicam truncate em nome/email/descrição.
6. **Mensagem de lista vazia:** a maioria usa `text-white/60` no `td` vazio; Categorias usa `text-white/60` também; padrão está ok, mas o texto da mensagem varia (“Nenhum … encontrado”, “Nenhuma … encontrada”, etc.).

---

## Resumo por página

| Página | Wrapper | thead | Responsivo | Truncate | Observação |
|--------|---------|--------|------------|----------|-------------|
| Projects | ✅ | ✅ | ❌ | ❌ | Padrão ok |
| Users | ✅ | ✅ | ❌ | ❌ | Nome/email podem vazar em telas pequenas |
| Cargos | ✅ | ✅ | ❌ | ❌ | Descrição pode vazar |
| Categories | ✅ | ✅ | ❌ | ✅ Nome, Descrição | Alinhado a Fornecedores |
| Suppliers | ✅ | ✅ | ❌ | ✅ Várias colunas | Referência de layout |
| Stock (Estoque) | ✅ | ✅ | ✅ | ✅ Item | Abreviações + table-fixed |
| Stock (Compras) | ✅ | ✅ | ❌ | — | Muitas colunas; pode precisar de abreviações |
| Stock (Solicitações) | ✅ | ✅ | ❌ | — | Idem |
| Communications | ⚠️ | ✅ | ❌ | — | Wrapper diferente |
| ProjectDetails | ⚠️ | ✅ | ❌ | — | Sem borda/rounded no wrapper; py-2 |

---

## Recomendações

1. **Unificar wrapper:** usar em todas `overflow-x-auto rounded-xl border border-white/10` no container da tabela (ajustar Communications e ProjectDetails).
2. **Unificar padding de célula:** preferir `px-4 py-3` em todas (ajustar ProjectDetails se quiser o mesmo padrão).
3. **Responsividade:** em tabelas com muitas colunas ou textos longos, considerar:
   - abreviações em mobile (como em Estoque), e/ou
   - `truncate` + `title` em colunas de texto (nome, descrição, etc.).
4. **Status:** padronizar uso de tokens do tema (`success`, `warning`, `danger`) em vez de cores fixas onde fizer sentido.
5. **Componente reutilizável (opcional):** criar um `DataTable` ou `Table` compartilhado (wrapper + table + thead padrão) para reduzir duplicação e garantir o mesmo visual em todas as listagens.

Se quiser, na próxima etapa podemos aplicar as alterações em Communications e ProjectDetails e/ou esboçar o componente `DataTable`.
