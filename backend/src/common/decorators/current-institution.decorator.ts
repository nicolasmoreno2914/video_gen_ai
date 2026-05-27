import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { Institution } from '../../modules/database/entities/institution.entity';

export const CurrentInstitution = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Institution | null => {
    const request = ctx.switchToHttp().getRequest<Request & { institution?: Institution }>();
    return request.institution ?? null;
  },
);
