// ===== Constantes de negócio =====
const ID_RECEPCIONISTA = 1; // fixo (simulação)
const DIAS_VENCIMENTO = 5;

// Catálogo de planos (simula a tabela Plano do banco)
const PLANOS = {
  1: { IDPlano: 1, Nome: "Mensal",     Valor: 100, DuracaoMeses: 1 },
  2: { IDPlano: 2, Nome: "Trimestral", Valor: 250, DuracaoMeses: 3 },
  3: { IDPlano: 3, Nome: "Semestral",  Valor: 450, DuracaoMeses: 6 },
  4: { IDPlano: 4, Nome: "Anual",      Valor: 800, DuracaoMeses: 12 },
};

// Chaves do localStorage (uma "tabela" por chave)
const CHAVES = {
  alunos: "doctorgym_alunos",
  matriculas: "doctorgym_matriculas",
  pagamentos: "doctorgym_pagamentos",
};

// ===== Utilitários de armazenamento =====
function lerTabela(chave) {
  try {
    return JSON.parse(localStorage.getItem(chave)) || [];
  } catch {
    return [];
  }
}

function salvarRegistro(chave, registro) {
  const tabela = lerTabela(chave);
  tabela.push(registro);
  localStorage.setItem(chave, JSON.stringify(tabela));
}

// ===== Utilitários de data =====
// Formata como YYYY-MM-DD usando a data local (evita bug de fuso do toISOString)
function formatarData(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// Soma meses preservando o dia; se o mês destino for mais curto
// (ex.: 31/01 + 1 mês), usa o último dia do mês (28/29/fev).
function somarMeses(data, meses) {
  const resultado = new Date(data.getFullYear(), data.getMonth() + meses, 1);
  const ultimoDia = new Date(resultado.getFullYear(), resultado.getMonth() + 1, 0).getDate();
  resultado.setDate(Math.min(data.getDate(), ultimoDia));
  return resultado;
}

function somarDias(data, dias) {
  const resultado = new Date(data);
  resultado.setDate(resultado.getDate() + dias);
  return resultado;
}

// ===== Validação =====
function cpfValido(cpf) {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;

  const digito = (tamanho) => {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(d[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

function validar(dados) {
  if (!dados.cpf || !dados.nome || !dados.email || !dados.endereco || !dados.plano) {
    return "Preencha todos os campos.";
  }
  if (!cpfValido(dados.cpf)) return "CPF inválido.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) return "E-mail inválido.";
  if (!PLANOS[dados.plano]) return "Selecione um plano válido.";
  return null;
}

// ===== Regra de negócio: cadastrar aluno + matrícula + pagamento =====
function cadastrarAluno(dados) {
  const hoje = new Date();
  const plano = PLANOS[dados.plano];

  // ID único: timestamp + sufixo aleatório (evita colisão em cliques rápidos)
  const idAluno = Number(`${Date.now()}${Math.floor(Math.random() * 90 + 10)}`);

  const aluno = {
    IDAluno: idAluno,
    CPF: dados.cpf.replace(/\D/g, ""),
    Nome: dados.nome,
    Email: dados.email,
    Endereco: dados.endereco,
    DataInscricao: formatarData(hoje),
  };

  const matricula = {
    IDMatricula: Date.now(),
    IDAluno: idAluno,
    IDPlano: plano.IDPlano,
    IDRecepcionista: ID_RECEPCIONISTA,
    DataInicio: formatarData(hoje),
    DataFim: formatarData(somarMeses(hoje, plano.DuracaoMeses)),
    Status: "Ativa",
  };

  const pagamento = {
    IDPagamento: Date.now() + 1,
    IDAluno: idAluno,
    IDPlano: plano.IDPlano,
    Valor: plano.Valor,
    Vencimento: formatarData(somarDias(hoje, DIAS_VENCIMENTO)),
    Status: "Pendente",
  };

  salvarRegistro(CHAVES.alunos, aluno);
  salvarRegistro(CHAVES.matriculas, matricula);
  salvarRegistro(CHAVES.pagamentos, pagamento);

  return { aluno, matricula, pagamento };
}

// ===== Interface =====
const form = document.getElementById("form-aluno");
const erro = document.getElementById("erro");
const sucesso = document.getElementById("sucesso");

const moeda = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso) => iso.split("-").reverse().join("/");

// --- Resumo ao vivo (lateral) ---
function atualizarResumo() {
  const plano = PLANOS[form.plano.value];
  const set = (id, txt) => (document.getElementById(id).textContent = txt);

  if (!plano) {
    ["r-plano", "r-duracao", "r-inicio", "r-fim", "r-venc"].forEach((id) => set(id, "—"));
    set("r-valor", moeda(0));
    return;
  }

  const hoje = new Date();
  set("r-plano", plano.Nome);
  set("r-duracao", plano.DuracaoMeses === 1 ? "1 mês" : `${plano.DuracaoMeses} meses`);
  set("r-inicio", dataBR(formatarData(hoje)));
  set("r-fim", dataBR(formatarData(somarMeses(hoje, plano.DuracaoMeses))));
  set("r-venc", dataBR(formatarData(somarDias(hoje, DIAS_VENCIMENTO))));
  set("r-valor", moeda(plano.Valor));
}

// --- Tabela de cadastros ---
function renderizarLista() {
  const alunos = lerTabela(CHAVES.alunos);
  const matriculas = lerTabela(CHAVES.matriculas);
  const pagamentos = lerTabela(CHAVES.pagamentos);
  const corpo = document.getElementById("tabela");

  corpo.innerHTML = "";
  document.getElementById("vazio").hidden = alunos.length > 0;

  alunos.slice().reverse().slice(0, 8).forEach((aluno) => {
    const mat = matriculas.find((m) => m.IDAluno === aluno.IDAluno);
    const pag = pagamentos.find((p) => p.IDAluno === aluno.IDAluno);
    const plano = PLANOS[mat?.IDPlano];

    const tr = document.createElement("tr");
    const celulas = [
      aluno.Nome,
      plano ? plano.Nome : "—",
      mat ? dataBR(mat.DataFim) : "—",
      pag ? moeda(pag.Valor) : "—",
    ];
    celulas.forEach((txt) => {
      const td = document.createElement("td");
      td.textContent = txt; // textContent evita injeção de HTML
      tr.appendChild(td);
    });

    const tdPag = document.createElement("td");
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = pag ? pag.Status : "—";
    tdPag.appendChild(tag);
    tr.appendChild(tdPag);

    corpo.appendChild(tr);
  });
}

// --- Máscara de CPF ---
document.getElementById("cpf").addEventListener("input", (e) => {
  const d = e.target.value.replace(/\D/g, "").slice(0, 11);
  e.target.value = d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
});

form.plano.addEventListener("change", atualizarResumo);

// --- Envio ---
function marcarInvalidos(dados) {
  const campos = ["cpf", "nome", "email", "endereco", "plano"];
  campos.forEach((c) => form[c].classList.remove("invalido"));
  if (!dados.cpf || !cpfValido(dados.cpf)) form.cpf.classList.add("invalido");
  if (!dados.nome) form.nome.classList.add("invalido");
  if (!dados.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) form.email.classList.add("invalido");
  if (!dados.endereco) form.endereco.classList.add("invalido");
  if (!PLANOS[dados.plano]) form.plano.classList.add("invalido");
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  sucesso.hidden = true;

  const dados = {
    cpf: form.cpf.value.trim(),
    nome: form.nome.value.trim(),
    email: form.email.value.trim(),
    endereco: form.endereco.value.trim(),
    plano: form.plano.value,
  };

  const mensagemErro = validar(dados);
  marcarInvalidos(dados);
  if (mensagemErro) {
    erro.textContent = mensagemErro;
    erro.hidden = false;
    return;
  }
  erro.hidden = true;

  const resultado = cadastrarAluno(dados);

  console.log("Cadastro gerado (JSON):");
  console.log(JSON.stringify(resultado, null, 2));

  sucesso.textContent =
    `${resultado.aluno.Nome} cadastrado! Matrícula ativa até ${dataBR(resultado.matricula.DataFim)}. ` +
    `Primeiro pagamento de ${moeda(resultado.pagamento.Valor)} vence em ${dataBR(resultado.pagamento.Vencimento)}.`;
  sucesso.hidden = false;

  alert(
    `Aluno cadastrado com sucesso!\n\n` +
    `Matrícula ativa até ${dataBR(resultado.matricula.DataFim)}.\n` +
    `Primeiro pagamento: ${moeda(resultado.pagamento.Valor)} ` +
    `(vence em ${dataBR(resultado.pagamento.Vencimento)}).`
  );

  form.reset();
  atualizarResumo();
  renderizarLista();
});

// --- Limpar dados (útil entre demonstrações) ---
document.getElementById("limpar").addEventListener("click", () => {
  if (!confirm("Apagar todos os cadastros salvos no navegador?")) return;
  Object.values(CHAVES).forEach((c) => localStorage.removeItem(c));
  sucesso.hidden = true;
  renderizarLista();
});

atualizarResumo();
renderizarLista();
