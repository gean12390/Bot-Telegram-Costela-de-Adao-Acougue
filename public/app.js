
async function verificarSistema() {
  try {
    const resposta = await fetch("/api/status");
    const dados = await resposta.json();

    document.getElementById("status").textContent =
      dados.online ? "● Sistema online" : "● Sistema offline";

  } catch (erro) {
    document.getElementById("status").textContent =
      "● Sistema offline";
  }
}

verificarSistema();
