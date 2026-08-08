export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class RecursoNaoEncontradoError extends AppError {
  constructor(message = "Recurso nao encontrado") {
    super(message, 404);
  }
}

export class ConflitoDeHorarioError extends AppError {
  constructor(message = "Ja existe uma reserva para esta mesa neste horario") {
    super(message, 409);
  }
}

export class RequisicaoInvalidaError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class ServicoIndisponivelError extends AppError {
  constructor(message = "Servico indisponivel no momento") {
    super(message, 503);
  }
}

// Doc 22/25: o mesmo PaymentIntent do deposito ja financiou outra reserva (retry/
// replay). Classe dedicada (em vez de RequisicaoInvalidaError generico) pra
// reservation-link.routes.ts saber que NAO deve reembolsar automaticamente esse
// PaymentIntent no catch de falha na criacao - ele nao falhou por causa desta
// tentativa, ja foi legitimamente usado por uma reserva anterior; reembolsar aqui
// devolveria o dinheiro de uma reserva valida que continua de pe.
export class DepositoJaUsadoError extends AppError {
  constructor(message = "Este deposito ja foi usado em outra reserva") {
    super(message, 400);
  }
}
