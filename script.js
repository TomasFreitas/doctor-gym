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
    set("r-valor", "—");
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

// ===== Navegação entre telas =====
const TELAS = {
  recepcao: "view-recepcao",
  aluno: "view-aluno",
  professor: "view-professor",
};

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const alvo = btn.dataset.view;
    Object.entries(TELAS).forEach(([chave, id]) => {
      document.getElementById(id).hidden = chave !== alvo;
    });
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("ativo", b === btn));
    document.getElementById("side-resumo").hidden = alvo !== "recepcao";
    if (alvo === "professor") renderizarExercicios();
  });
});

// Cria uma <td> com texto (textContent evita injeção de HTML)
function criarCelula(texto) {
  const td = document.createElement("td");
  td.textContent = texto;
  return td;
}

function criarTag(texto, classeExtra) {
  const td = document.createElement("td");
  const span = document.createElement("span");
  span.className = classeExtra ? `tag ${classeExtra}` : "tag";
  span.textContent = texto;
  td.appendChild(span);
  return td;
}

// ===== US 2: Aluno consulta histórico de pagamentos =====
const formConsulta = document.getElementById("form-consulta");
const inputCpfConsulta = document.getElementById("cpf-consulta");
const consultaAviso = document.getElementById("consulta-aviso");
const consultaResultado = document.getElementById("consulta-resultado");

inputCpfConsulta.addEventListener("input", (e) => {
  const d = e.target.value.replace(/\D/g, "").slice(0, 11);
  e.target.value = d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
});

function mostrarAviso(texto, classe) {
  consultaAviso.textContent = texto;
  consultaAviso.className = `banner ${classe}`;
  consultaAviso.hidden = false;
}

formConsulta.addEventListener("submit", (e) => {
  e.preventDefault();
  consultaAviso.hidden = true;
  consultaResultado.hidden = true;

  const cpf = inputCpfConsulta.value.replace(/\D/g, "");
  if (!cpfValido(cpf)) {
    mostrarAviso("CPF inválido.", "banner-erro");
    return;
  }

  const aluno = lerTabela(CHAVES.alunos).find((a) => a.CPF === cpf);
  if (!aluno) {
    mostrarAviso("Nenhum aluno encontrado com esse CPF.", "banner-erro");
    return;
  }

  const hoje = formatarData(new Date());
  const pagamentos = lerTabela(CHAVES.pagamentos)
    .filter((p) => p.IDAluno === aluno.IDAluno)
    .sort((a, b) => b.Vencimento.localeCompare(a.Vencimento));

  const corpo = document.getElementById("consulta-tabela");
  corpo.innerHTML = "";

  let pendencias = 0;
  pagamentos.forEach((p) => {
    const atrasado = p.Status === "Pendente" && p.Vencimento < hoje;
    if (p.Status !== "Pago") pendencias++;

    const tr = document.createElement("tr");
    tr.appendChild(criarCelula(PLANOS[p.IDPlano] ? PLANOS[p.IDPlano].Nome : "—"));
    tr.appendChild(criarCelula(moeda(p.Valor)));
    tr.appendChild(criarCelula(dataBR(p.Vencimento)));
    tr.appendChild(
      criarTag(atrasado ? "Atrasado" : p.Status, atrasado ? "tag-atrasado" : p.Status === "Pago" ? "tag-pago" : "")
    );
    corpo.appendChild(tr);
  });

  document.getElementById("consulta-nome").textContent = `Olá, ${aluno.Nome}`;
  consultaResultado.hidden = false;

  if (pendencias > 0) {
    mostrarAviso(
      `Você tem ${pendencias} pendência${pendencias > 1 ? "s" : ""} ativa${pendencias > 1 ? "s" : ""}.`,
      "banner-aviso"
    );
  } else {
    mostrarAviso("Tudo certo! Você não tem pendências.", "banner-ok");
  }
});

// ===== US 3: Professor lista exercícios por grupo muscular =====
const EXERCICIOS = [
  { Nome: "Supino reto",            Grupo: "Peito",   Equipamento: "Barra",      Sugestao: "4 x 8-12" },
  { Nome: "Supino inclinado",       Grupo: "Peito",   Equipamento: "Halteres",   Sugestao: "3 x 10-12" },
  { Nome: "Crucifixo",              Grupo: "Peito",   Equipamento: "Halteres",   Sugestao: "3 x 12" },
  { Nome: "Puxada frontal",         Grupo: "Costas",  Equipamento: "Polia",      Sugestao: "4 x 10" },
  { Nome: "Remada curvada",         Grupo: "Costas",  Equipamento: "Barra",      Sugestao: "4 x 8-10" },
  { Nome: "Remada baixa",           Grupo: "Costas",  Equipamento: "Polia",      Sugestao: "3 x 12" },
  { Nome: "Desenvolvimento",        Grupo: "Ombros",  Equipamento: "Halteres",   Sugestao: "4 x 8-10" },
  { Nome: "Elevação lateral",       Grupo: "Ombros",  Equipamento: "Halteres",   Sugestao: "3 x 12-15" },
  { Nome: "Rosca direta",           Grupo: "Bíceps",  Equipamento: "Barra W",    Sugestao: "3 x 10-12" },
  { Nome: "Rosca martelo",          Grupo: "Bíceps",  Equipamento: "Halteres",   Sugestao: "3 x 12" },
  { Nome: "Tríceps pulley",         Grupo: "Tríceps", Equipamento: "Polia",      Sugestao: "3 x 12" },
  { Nome: "Tríceps testa",          Grupo: "Tríceps", Equipamento: "Barra W",    Sugestao: "3 x 10" },
  { Nome: "Agachamento livre",      Grupo: "Pernas",  Equipamento: "Barra",      Sugestao: "4 x 8-10" },
  { Nome: "Leg press 45°",          Grupo: "Pernas",  Equipamento: "Máquina",    Sugestao: "4 x 12" },
  { Nome: "Cadeira extensora",      Grupo: "Pernas",  Equipamento: "Máquina",    Sugestao: "3 x 12-15" },
  { Nome: "Abdominal supra",        Grupo: "Abdômen", Equipamento: "Colchonete", Sugestao: "3 x 20" },
  { Nome: "Prancha",                Grupo: "Abdômen", Equipamento: "Colchonete", Sugestao: "3 x 40 s" },
];

function renderizarExercicios() {
  const grupo = document.getElementById("grupo").value;
  const lista = grupo ? EXERCICIOS.filter((x) => x.Grupo === grupo) : EXERCICIOS;
  const corpo = document.getElementById("grupo-tabela");

  corpo.innerHTML = "";
  lista.forEach((x) => {
    const tr = document.createElement("tr");
    tr.appendChild(criarCelula(x.Nome));
    tr.appendChild(criarTag(x.Grupo, "tag-grupo"));
    tr.appendChild(criarCelula(x.Equipamento));
    tr.appendChild(criarCelula(x.Sugestao));
    corpo.appendChild(tr);
  });

  document.getElementById("grupo-contagem").textContent =
    `${lista.length} exercício${lista.length !== 1 ? "s" : ""}`;
}

document.getElementById("grupo").addEventListener("change", renderizarExercicios);
renderizarExercicios();
