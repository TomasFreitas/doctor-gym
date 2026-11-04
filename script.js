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

  // Parcelado: 1 pagamento por mês (N = duração do plano). À vista: pagamento único.
  const totalParcelas = dados.forma === "avista" ? 1 : plano.DuracaoMeses;
  const primeiroVencimento = somarDias(hoje, DIAS_VENCIMENTO);
  const valores = dividirEmParcelas(plano.Valor, totalParcelas);

  const pagamentos = valores.map((valor, i) => ({
    IDPagamento: Date.now() + 1 + i,
    IDAluno: idAluno,
    IDPlano: plano.IDPlano,
    NumeroParcela: i + 1,
    TotalParcelas: totalParcelas,
    Valor: valor,
    Vencimento: formatarData(somarMeses(primeiroVencimento, i)),
    Status: "Pendente",
  }));

  salvarRegistro(CHAVES.alunos, aluno);
  salvarRegistro(CHAVES.matriculas, matricula);
  pagamentos.forEach((p) => salvarRegistro(CHAVES.pagamentos, p));

  return { aluno, matricula, pagamentos };
}

// Divide o valor em N parcelas, em centavos; os centavos que sobram vão
// 1 a 1 para as primeiras parcelas (ex.: R$ 250,00 em 3x = 83,34 + 83,33 + 83,33).
// A soma das parcelas sempre fecha exatamente o valor do plano.
function dividirEmParcelas(valorTotal, n) {
  const totalCentavos = Math.round(valorTotal * 100);
  const base = Math.floor(totalCentavos / n);
  const sobra = totalCentavos - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < sobra ? 1 : 0)) / 100);
}

// Migração: cadastros antigos tinham 1 pagamento único, mesmo em planos longos.
// Converte esse pagamento em N parcelas mensais (uma vez só).
function migrarPagamentosAntigos() {
  const pagamentos = lerTabela(CHAVES.pagamentos);
  if (!pagamentos.some((p) => p.TotalParcelas === undefined)) return;

  const novos = [];
  pagamentos.forEach((p, idx) => {
    if (p.TotalParcelas !== undefined) {
      novos.push(p);
      return;
    }
    const plano = PLANOS[p.IDPlano];
    const n = plano ? plano.DuracaoMeses : 1;
    const valores = dividirEmParcelas(p.Valor, n);
    const [ano, mes, dia] = p.Vencimento.split("-").map(Number);
    const primeiroVenc = new Date(ano, mes - 1, dia);

    valores.forEach((valor, i) => {
      novos.push({
        ...p,
        IDPagamento: i === 0 ? p.IDPagamento : Number(`${p.IDPagamento}${i}`),
        NumeroParcela: i + 1,
        TotalParcelas: n,
        Valor: valor,
        Vencimento: formatarData(somarMeses(primeiroVenc, i)),
        Status: i === 0 ? p.Status : "Pendente",
      });
    });
  });
  localStorage.setItem(CHAVES.pagamentos, JSON.stringify(novos));
}
migrarPagamentosAntigos();

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
    ["r-plano", "r-duracao", "r-total", "r-parcelas", "r-inicio", "r-fim", "r-venc"].forEach((id) => set(id, "—"));
    set("r-valor", "—");
    return;
  }

  const hoje = new Date();
  const totalParcelas = form.forma.value === "avista" ? 1 : plano.DuracaoMeses;
  const valores = dividirEmParcelas(plano.Valor, totalParcelas);
  set("r-total", moeda(plano.Valor));
  set("r-parcelas", totalParcelas === 1 ? "À vista" : `${totalParcelas}x de ${moeda(valores[0])}`);
  set("r-plano", plano.Nome);
  set("r-duracao", plano.DuracaoMeses === 1 ? "1 mês" : `${plano.DuracaoMeses} meses`);
  set("r-inicio", dataBR(formatarData(hoje)));
  set("r-fim", dataBR(formatarData(somarMeses(hoje, plano.DuracaoMeses))));
  set("r-venc", dataBR(formatarData(somarDias(hoje, DIAS_VENCIMENTO))));
  set("r-valor", moeda(valores[0]));
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
    const pagsAluno = pagamentos
      .filter((p) => p.IDAluno === aluno.IDAluno)
      .sort((a, b) => a.NumeroParcela - b.NumeroParcela);
    const pag = pagsAluno[0];
    const plano = PLANOS[mat?.IDPlano];
    const n = pagsAluno.length;
    const textoValor = !pag ? "—" : n > 1 ? `${n}x de ${moeda(pag.Valor)}` : moeda(pag.Valor);
    const statusGeral = pagsAluno.every((p) => p.Status === "Pago") ? "Pago" : "Pendente";

    const tr = document.createElement("tr");
    const celulas = [
      aluno.Nome,
      plano ? plano.Nome : "—",
      mat ? dataBR(mat.DataFim) : "—",
      textoValor,
    ];
    celulas.forEach((txt) => {
      const td = document.createElement("td");
      td.textContent = txt; // textContent evita injeção de HTML
      tr.appendChild(td);
    });

    const tdPag = document.createElement("td");
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = pag ? statusGeral : "—";
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
form.forma.addEventListener("change", atualizarResumo);

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
    forma: form.forma.value,
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

  const primeira = resultado.pagamentos[0];
  const np = resultado.pagamentos.length;
  const textoPag = np > 1
    ? `${np} parcelas mensais de ${moeda(primeira.Valor)}`
    : `pagamento único de ${moeda(primeira.Valor)}`;

  sucesso.textContent =
    `${resultado.aluno.Nome} cadastrado! Matrícula ativa até ${dataBR(resultado.matricula.DataFim)}. ` +
    `${textoPag}; a 1ª vence em ${dataBR(primeira.Vencimento)}.`;
  sucesso.hidden = false;

  alert(
    `Aluno cadastrado com sucesso!\n\n` +
    `Matrícula ativa até ${dataBR(resultado.matricula.DataFim)}.\n` +
    `Pagamento: ${textoPag}.\n` +
    `1ª parcela vence em ${dataBR(primeira.Vencimento)}.`
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
  "aluno-treinos": "view-aluno-treinos",
  "aluno-faturas": "view-aluno-faturas",
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
    .sort((a, b) => a.Vencimento.localeCompare(b.Vencimento));

  const corpo = document.getElementById("consulta-tabela");
  corpo.innerHTML = "";

  let pendencias = 0;
  let atrasadas = 0;
  let valorAberto = 0;
  let proximoVenc = null;
  pagamentos.forEach((p) => {
    const atrasado = p.Status === "Pendente" && p.Vencimento < hoje;
    if (p.Status !== "Pago") {
      pendencias++;
      valorAberto += p.Valor;
      if (!proximoVenc) proximoVenc = p.Vencimento;
    }
    if (atrasado) atrasadas++;

    const tr = document.createElement("tr");
    tr.appendChild(criarCelula(PLANOS[p.IDPlano] ? PLANOS[p.IDPlano].Nome : "—"));
    tr.appendChild(criarCelula(p.TotalParcelas > 1 ? `${p.NumeroParcela}/${p.TotalParcelas}` : "Única"));
    tr.appendChild(criarCelula(moeda(p.Valor)));
    tr.appendChild(criarCelula(dataBR(p.Vencimento)));
    tr.appendChild(
      criarTag(atrasado ? "Atrasado" : p.Status, atrasado ? "tag-atrasado" : p.Status === "Pago" ? "tag-pago" : "")
    );
    corpo.appendChild(tr);
  });

  document.getElementById("consulta-nome").textContent = `Olá, ${aluno.Nome}`;
  consultaResultado.hidden = false;

  if (atrasadas > 0) {
    mostrarAviso(
      `Você tem ${atrasadas} parcela${atrasadas > 1 ? "s" : ""} em atraso. ` +
      `Total em aberto: ${moeda(valorAberto)} (${pendencias} parcela${pendencias > 1 ? "s" : ""}).`,
      "banner-erro"
    );
  } else if (pendencias > 0) {
    mostrarAviso(
      `Você tem ${pendencias} parcela${pendencias > 1 ? "s" : ""} em aberto, somando ${moeda(valorAberto)}. ` +
      `Próximo vencimento: ${dataBR(proximoVenc)}.`,
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

    const tdAcao = document.createElement("td");
    const btnAdd = document.createElement("button");
    btnAdd.type = "button";
    btnAdd.className = "btn-mini";
    btnAdd.textContent = "Adicionar";
    btnAdd.addEventListener("click", () => adicionarAFicha(x));
    tdAcao.appendChild(btnAdd);
    tr.appendChild(tdAcao);

    corpo.appendChild(tr);
  });

  document.getElementById("grupo-contagem").textContent =
    `${lista.length} exercício${lista.length !== 1 ? "s" : ""}`;
}

document.getElementById("grupo").addEventListener("change", renderizarExercicios);
renderizarExercicios();

// ===== Login por perfil =====
// Simulação de front-end: não é segurança real (sem backend, as credenciais
// ficam no código). Serve para demonstrar o controle de acesso por perfil.
const USUARIOS = {
  recepcao:  { usuario: "recepcao",  senha: "recepcao123",  nome: "Recepção" },
  professor: { usuario: "professor", senha: "professor123", nome: "Professor" },
};

const ROTULO_PERFIL = { aluno: "Aluno", professor: "Professor", recepcao: "Recepcionista" };
const CHAVE_SESSAO = "doctorgym_sessao";
const SUBTITULO_PAINEL = {
  aluno: "Painel do aluno",
  professor: "Painel do professor",
  recepcao: "Painel da recepção",
};

const telaLogin = document.getElementById("tela-login");
const appEl = document.getElementById("app");
const formLogin = document.getElementById("form-login");
const loginErro = document.getElementById("login-erro");
const loginCpf = document.getElementById("login-cpf");
let perfilLogin = "aluno";

function lerSessao() {
  try {
    return JSON.parse(sessionStorage.getItem(CHAVE_SESSAO));
  } catch {
    return null;
  }
}

function salvarSessao(sessao) {
  try {
    sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
  } catch { /* sem sessionStorage: segue sem persistir */ }
}

function limparSessao() {
  try {
    sessionStorage.removeItem(CHAVE_SESSAO);
  } catch { /* ignora */ }
}

loginCpf.addEventListener("input", (e) => {
  const d = e.target.value.replace(/\D/g, "").slice(0, 11);
  e.target.value = d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
});

function selecionarPerfil(perfil) {
  perfilLogin = perfil;
  document.querySelectorAll(".perfil").forEach((b) => b.classList.toggle("ativo", b.dataset.perfil === perfil));
  document.getElementById("campo-cpf").hidden = perfil !== "aluno";
  document.getElementById("campos-staff").hidden = perfil === "aluno";
  loginErro.hidden = true;

  const dica = document.getElementById("login-dica");
  if (perfil === "aluno") {
    dica.textContent = "Use o CPF informado na matrícula.";
  } else {
    const u = USUARIOS[perfil];
    dica.innerHTML = "";
    dica.append("Demonstração: usuário ");
    const c1 = document.createElement("code");
    c1.textContent = u.usuario;
    const c2 = document.createElement("code");
    c2.textContent = u.senha;
    dica.append(c1, " e senha ", c2);
  }
}

document.querySelectorAll(".perfil").forEach((b) => {
  b.addEventListener("click", () => selecionarPerfil(b.dataset.perfil));
});

function entrarNoApp(sessao) {
  telaLogin.hidden = true;
  appEl.hidden = false;

  // Cada perfil enxerga apenas a própria aba
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.hidden = b.dataset.perfil !== sessao.perfil;
  });
  document.getElementById("usuario-nome").textContent = sessao.nome;
  document.getElementById("usuario-perfil").textContent = ROTULO_PERFIL[sessao.perfil];
  document.getElementById("brand-sub").textContent = SUBTITULO_PAINEL[sessao.perfil];
  document.querySelector(`.nav-btn[data-perfil="${sessao.perfil}"]`).click(); // abre a 1ª aba do perfil

  // Aluno vê automaticamente os próprios pagamentos
  if (sessao.perfil === "aluno") {
    inputCpfConsulta.value = sessao.cpf;
    formConsulta.requestSubmit();
    renderizarMeusTreinos(sessao.cpf);
  }
}

formLogin.addEventListener("submit", (e) => {
  e.preventDefault();
  loginErro.hidden = true;

  let sessao = null;
  let mensagem = null;

  if (perfilLogin === "aluno") {
    const cpf = loginCpf.value.replace(/\D/g, "");
    const aluno = cpfValido(cpf) ? lerTabela(CHAVES.alunos).find((a) => a.CPF === cpf) : null;
    if (!cpfValido(cpf)) mensagem = "CPF inválido.";
    else if (!aluno) mensagem = "CPF não cadastrado. Procure a recepção.";
    else sessao = { perfil: "aluno", nome: aluno.Nome, cpf };
  } else {
    const cred = USUARIOS[perfilLogin];
    const usuario = document.getElementById("login-usuario").value.trim();
    const senha = document.getElementById("login-senha").value;
    if (usuario !== cred.usuario || senha !== cred.senha) mensagem = "Usuário ou senha inválidos.";
    else sessao = { perfil: perfilLogin, nome: cred.nome };
  }

  if (!sessao) {
    loginErro.textContent = mensagem;
    loginErro.hidden = false;
    return;
  }

  salvarSessao(sessao);
  formLogin.reset();
  entrarNoApp(sessao);
});

document.getElementById("sair").addEventListener("click", () => {
  limparSessao();
  // Limpa o que o perfil anterior estava vendo
  inputCpfConsulta.value = "";
  consultaAviso.hidden = true;
  consultaResultado.hidden = true;
  appEl.hidden = true;
  telaLogin.hidden = false;
  selecionarPerfil("aluno");
});

selecionarPerfil("aluno");

// ===== Professor: criar treino e atribuir ao aluno =====
// Treino = modelo reutilizável (doctorgym_treinos).
// Atribuição = vínculo treino <-> aluno (doctorgym_treino_aluno).
CHAVES.treinos = "doctorgym_treinos";
CHAVES.atribuicoes = "doctorgym_treino_aluno";
const ID_PROFESSOR = 1; // fixo (simulação)

let ficha = []; // exercícios do treino em montagem

const treinoAluno = document.getElementById("treino-aluno");
const treinoNome = document.getElementById("treino-nome");
const treinoErro = document.getElementById("treino-erro");
const treinoSucesso = document.getElementById("treino-sucesso");
const atribTreino = document.getElementById("atrib-treino");
const atribAluno = document.getElementById("atrib-aluno");
const atribErro = document.getElementById("atrib-erro");
const atribSucesso = document.getElementById("atrib-sucesso");

// Migração: treinos salvos na versão anterior já tinham IDAluno.
// Separa o vínculo em uma atribuição e deixa o treino como modelo.
function migrarTreinosAntigos() {
  const treinos = lerTabela(CHAVES.treinos);
  if (!treinos.some((t) => t.IDAluno !== undefined)) return;

  const atribuicoes = lerTabela(CHAVES.atribuicoes);
  const modelos = treinos.map((t) => {
    if (t.IDAluno === undefined) return t;
    atribuicoes.push({
      IDAtribuicao: t.IDTreino,
      IDTreino: t.IDTreino,
      IDAluno: t.IDAluno,
      DataAtribuicao: t.DataCriacao,
    });
    const { IDAluno, ...modelo } = t;
    return modelo;
  });
  localStorage.setItem(CHAVES.treinos, JSON.stringify(modelos));
  localStorage.setItem(CHAVES.atribuicoes, JSON.stringify(atribuicoes));
}
migrarTreinosAntigos();

// Preenche um <select> mantendo a opção inicial e a seleção atual
function preencherSelect(select, itens, textoVazio) {
  const atual = select.value;
  select.innerHTML = "";
  const vazio = document.createElement("option");
  vazio.value = "";
  vazio.textContent = textoVazio;
  select.appendChild(vazio);
  itens.forEach(({ valor, rotulo }) => {
    const op = document.createElement("option");
    op.value = valor;
    op.textContent = rotulo;
    select.appendChild(op);
  });
  select.value = atual;
}

function atribuirTreino(idTreino, idAluno) {
  const atribuicao = {
    IDAtribuicao: Date.now() + 1,
    IDTreino: idTreino,
    IDAluno: idAluno,
    DataAtribuicao: formatarData(new Date()),
  };
  salvarRegistro(CHAVES.atribuicoes, atribuicao);
  return atribuicao;
}

function jaAtribuido(idTreino, idAluno) {
  return lerTabela(CHAVES.atribuicoes).some((a) => a.IDTreino === idTreino && a.IDAluno === idAluno);
}

// --- Ficha em montagem ---
function adicionarAFicha(exercicio) {
  treinoSucesso.hidden = true;
  if (ficha.some((i) => i.Nome === exercicio.Nome)) {
    treinoErro.textContent = `"${exercicio.Nome}" já está no treino.`;
    treinoErro.hidden = false;
    return;
  }
  treinoErro.hidden = true;
  ficha.push({
    Nome: exercicio.Nome,
    Grupo: exercicio.Grupo,
    Equipamento: exercicio.Equipamento,
    Series: exercicio.Sugestao,
  });
  renderizarFicha();
}

function renderizarFicha() {
  const corpo = document.getElementById("treino-itens");
  corpo.innerHTML = "";
  document.getElementById("treino-vazio").hidden = ficha.length > 0;

  ficha.forEach((item, i) => {
    const tr = document.createElement("tr");
    tr.appendChild(criarCelula(item.Nome));
    tr.appendChild(criarTag(item.Grupo, "tag-grupo"));

    const tdSeries = document.createElement("td");
    const input = document.createElement("input");
    input.type = "text";
    input.value = item.Series;
    input.setAttribute("aria-label", `Séries de ${item.Nome}`);
    input.addEventListener("input", () => (ficha[i].Series = input.value));
    tdSeries.appendChild(input);
    tr.appendChild(tdSeries);

    const tdRem = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-mini perigo";
    btn.textContent = "Remover";
    btn.addEventListener("click", () => {
      ficha.splice(i, 1);
      renderizarFicha();
    });
    tdRem.appendChild(btn);
    tr.appendChild(tdRem);

    corpo.appendChild(tr);
  });
}

// --- Listas e selects ---
function atualizarTelaProfessor() {
  const alunos = lerTabela(CHAVES.alunos).map((a) => ({ valor: a.IDAluno, rotulo: a.Nome }));
  const treinos = lerTabela(CHAVES.treinos);

  preencherSelect(treinoAluno, alunos, "Não atribuir agora");
  preencherSelect(atribAluno, alunos, "Selecione o aluno...");
  preencherSelect(atribTreino, treinos.map((t) => ({ valor: t.IDTreino, rotulo: t.Nome })), "Selecione o treino...");

  // Treinos criados
  const corpo = document.getElementById("treinos-tabela");
  corpo.innerHTML = "";
  document.getElementById("treinos-vazio").hidden = treinos.length > 0;
  treinos.slice().reverse().slice(0, 8).forEach((t) => {
    const tr = document.createElement("tr");
    tr.appendChild(criarCelula(t.Nome));
    const tdEx = criarCelula(t.Exercicios.map((e) => `${e.Nome} (${e.Series})`).join(", "));
    tdEx.className = "quebra";
    tr.appendChild(tdEx);
    tr.appendChild(criarCelula(dataBR(t.DataCriacao)));
    corpo.appendChild(tr);
  });

  // Treinos atribuídos
  const atribuicoes = lerTabela(CHAVES.atribuicoes);
  const alunosTab = lerTabela(CHAVES.alunos);
  const corpoAtr = document.getElementById("atribuidos-tabela");
  corpoAtr.innerHTML = "";
  document.getElementById("atribuidos-vazio").hidden = atribuicoes.length > 0;
  atribuicoes.slice().reverse().slice(0, 8).forEach((a) => {
    const aluno = alunosTab.find((x) => x.IDAluno === a.IDAluno);
    const treino = treinos.find((t) => t.IDTreino === a.IDTreino);
    const tr = document.createElement("tr");
    tr.appendChild(criarCelula(aluno ? aluno.Nome : "—"));
    tr.appendChild(criarCelula(treino ? treino.Nome : "—"));
    tr.appendChild(criarCelula(dataBR(a.DataAtribuicao)));
    corpoAtr.appendChild(tr);
  });
}

// --- 1) Criar treino ---
document.getElementById("form-treino").addEventListener("submit", (e) => {
  e.preventDefault();
  treinoSucesso.hidden = true;

  const nome = treinoNome.value.trim();
  let mensagem = null;
  if (!nome) mensagem = "Informe o nome do treino.";
  else if (ficha.length === 0) mensagem = "Adicione ao menos um exercício ao treino.";
  else if (ficha.some((i) => !i.Series.trim())) mensagem = "Preencha séries x repetições de todos os exercícios.";

  treinoNome.classList.toggle("invalido", !nome);
  if (mensagem) {
    treinoErro.textContent = mensagem;
    treinoErro.hidden = false;
    return;
  }
  treinoErro.hidden = true;

  const treino = {
    IDTreino: Date.now(),
    IDProfessor: ID_PROFESSOR,
    Nome: nome,
    DataCriacao: formatarData(new Date()),
    Exercicios: ficha.map((i) => ({ ...i, Series: i.Series.trim() })),
  };
  salvarRegistro(CHAVES.treinos, treino);

  let atribuicao = null;
  let nomeAluno = "";
  if (treinoAluno.value) {
    atribuicao = atribuirTreino(treino.IDTreino, Number(treinoAluno.value));
    nomeAluno = lerTabela(CHAVES.alunos).find((a) => a.IDAluno === atribuicao.IDAluno)?.Nome ?? "";
  }

  console.log("Treino criado (JSON):");
  console.log(JSON.stringify(atribuicao ? { treino, atribuicao } : { treino }, null, 2));

  treinoSucesso.textContent =
    `Treino "${treino.Nome}" criado com ${treino.Exercicios.length} exercício(s)` +
    (atribuicao ? ` e atribuído a ${nomeAluno}.` : ". Use a seção 2 para atribuí-lo a um aluno.");
  treinoSucesso.hidden = false;

  ficha = [];
  treinoNome.value = "";
  treinoAluno.value = "";
  renderizarFicha();
  atualizarTelaProfessor();
});

// --- 2) Atribuir treino existente a um aluno ---
document.getElementById("form-atribuir").addEventListener("submit", (e) => {
  e.preventDefault();
  atribSucesso.hidden = true;

  const idTreino = Number(atribTreino.value);
  const idAluno = Number(atribAluno.value);
  let mensagem = null;
  if (!atribTreino.value) mensagem = "Selecione o treino.";
  else if (!atribAluno.value) mensagem = "Selecione o aluno.";
  else if (jaAtribuido(idTreino, idAluno)) mensagem = "Esse treino já foi atribuído a esse aluno.";

  atribTreino.classList.toggle("invalido", !atribTreino.value);
  atribAluno.classList.toggle("invalido", !atribAluno.value);
  if (mensagem) {
    atribErro.textContent = mensagem;
    atribErro.hidden = false;
    return;
  }
  atribErro.hidden = true;

  const atribuicao = atribuirTreino(idTreino, idAluno);
  console.log("Treino atribuído (JSON):");
  console.log(JSON.stringify(atribuicao, null, 2));

  const nomeTreino = lerTabela(CHAVES.treinos).find((t) => t.IDTreino === idTreino)?.Nome ?? "";
  const nomeAluno = lerTabela(CHAVES.alunos).find((a) => a.IDAluno === idAluno)?.Nome ?? "";
  atribSucesso.textContent = `Treino "${nomeTreino}" atribuído a ${nomeAluno}.`;
  atribSucesso.hidden = false;

  atribTreino.value = "";
  atribAluno.value = "";
  atualizarTelaProfessor();
});

// Ao abrir a aba do professor, atualiza selects e listas
document.querySelector('.nav-btn[data-view="professor"]').addEventListener("click", atualizarTelaProfessor);

renderizarFicha();

// ===== Aluno: treinos atribuídos pelo professor =====
function renderizarMeusTreinos(cpf) {
  const lista = document.getElementById("meus-treinos-lista");
  lista.innerHTML = "";

  const aluno = lerTabela(CHAVES.alunos).find((a) => a.CPF === cpf);
  const treinos = lerTabela(CHAVES.treinos);
  const atribuicoes = aluno
    ? lerTabela(CHAVES.atribuicoes).filter((a) => a.IDAluno === aluno.IDAluno).reverse()
    : [];

  let exibidos = 0;
  atribuicoes.forEach((at) => {
    const treino = treinos.find((t) => t.IDTreino === at.IDTreino);
    if (!treino) return;
    exibidos++;

    const card = document.createElement("div");
    card.className = "treino-card";

    const titulo = document.createElement("h4");
    titulo.textContent = treino.Nome;
    const sub = document.createElement("small");
    sub.textContent = `Atribuído em ${dataBR(at.DataAtribuicao)} · ${treino.Exercicios.length} exercício(s)`;

    const wrap = document.createElement("div");
    wrap.className = "tabela-wrap";
    const tabela = document.createElement("table");
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    ["Exercício", "Grupo", "Equipamento", "Séries x repetições"].forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    const tbody = document.createElement("tbody");
    treino.Exercicios.forEach((ex) => {
      const tr = document.createElement("tr");
      tr.appendChild(criarCelula(ex.Nome));
      tr.appendChild(criarTag(ex.Grupo, "tag-grupo"));
      tr.appendChild(criarCelula(ex.Equipamento));
      tr.appendChild(criarCelula(ex.Series));
      tbody.appendChild(tr);
    });
    tabela.append(thead, tbody);
    wrap.appendChild(tabela);

    card.append(titulo, sub, wrap);
    lista.appendChild(card);
  });

  document.getElementById("meus-treinos-vazio").hidden = exibidos > 0;
}

// Restaura a sessão da aba (por último, para tudo já estar definido)
const sessaoAtual = lerSessao();
if (sessaoAtual && ROTULO_PERFIL[sessaoAtual.perfil]) entrarNoApp(sessaoAtual);
