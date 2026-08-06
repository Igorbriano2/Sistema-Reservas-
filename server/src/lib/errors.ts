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
