/**
 * MotorLab — LABORATÓRIO técnico do motor (o demo histórico).
 *
 * Preserva o demo intacto: apenas embrulha o `App.tsx` original, que continua sendo a
 * vitrine de baixo nível do motor estável (presets, paginação, wrap, capa, PDF técnico).
 * Não é o produto final; é onde se testa o motor.
 */
import App from '../App';

export default function MotorLab() {
  return <App />;
}
