window.SoccerManagerAPI = {
  async health() {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error('Backend indisponível');
    return response.json();
  },
  async version() {
    const response = await fetch('/api/version');
    if (!response.ok) throw new Error('Não foi possível ler a versão');
    return response.json();
  }
};
