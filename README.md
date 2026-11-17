# Doctor Gym

Sistema web de gestão de academia com três perfis de acesso: **Recepção**, **Professor** e **Aluno**.
Feito em HTML, CSS e JavaScript puro, sem dependências. Os dados ficam salvos no navegador (`localStorage`).

## Como rodar

Basta abrir o `index.html` no navegador. Se preferir servir localmente:

```bash
python3 -m http.server 8080
# abrir http://localhost:8080
```

## Acesso de demonstração

Na tela de login, clique em **"Carregar dados de exemplo"** para criar 7 alunos, 3 treinos e 2 exercícios.
As credenciais aparecem embaixo do formulário e podem ser clicadas para preencher os campos.

| Perfil | Acesso |
|---|---|
| Aluno | CPF `123.456.789-09` (carrega os dados de exemplo automaticamente se o navegador estiver vazio) |
| Professor | usuário `professor` / senha `professor123` |
| Recepção | usuário `recepcao` / senha `recepcao123` |

> O login é uma simulação de front-end para demonstrar o controle de acesso por perfil; não há backend.

## Histórias de usuário

| ID | Perfil | Funcionalidade | Onde ver |
|---|---|---|---|
| US1 | Recepção | Cadastrar matrícula vinculada a um plano, gerando as parcelas | Matrícula |
| US2 | Aluno | Consultar histórico de pagamentos e pendências | Faturas |
| US3 | Professor | Listar exercícios por grupo muscular | Exercícios |
| US4 | Recepção | Dar baixa manual em parcela pendente | Alunos → abrir aluno |
| US5 | Recepção | Buscar alunos por CPF ou nome | Alunos |
| US6 | Recepção | Cancelar matrícula (Inativa) e as parcelas futuras | Alunos → abrir aluno |
| US7 | Professor | Cadastrar novos exercícios | Exercícios → + Cadastrar exercício |
| US8 | Aluno | Ver a ficha de treino com séries e repetições | Treinos |
| US9 | Professor | Editar, inativar, remover ou excluir treinos | Alunos e Treinos |
| US10 | Recepção | Relatório de faturas atrasadas do mês | Inadimplência |

Extra: o aluno pode pagar uma parcela pendente por um **Pix simulado** (QR Code ilustrativo e código copia e cola com chave fictícia); nenhum valor é cobrado.

## Roteiro rápido de apresentação

1. **Recepção:** carregar os dados de exemplo, mostrar a busca de alunos, dar baixa numa parcela, cancelar uma matrícula e abrir o relatório de inadimplência.
2. **Professor:** criar um treino no editor, atribuir a um aluno, inativar e reativar.
3. **Aluno** (CPF `123.456.789-09`): ver a ficha de treino e pagar a parcela atrasada via Pix simulado.

## Estrutura

```
index.html   telas e formulários
script.js    regras de negócio, armazenamento e interface
style.css    estilos
```
