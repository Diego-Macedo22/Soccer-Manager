/** Ponto de migração do mercado para execução server-side. */
function evaluateTransfer() {
  throw new Error('Transfer engine server-side ainda não migrada.');
}
module.exports = { evaluateTransfer };
