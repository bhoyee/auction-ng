import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IncomingMessage } from 'node:http';
import { AuthService, type AuthIdentity } from './auth-service';

export const Public = () => SetMetadata('auth:public', true);
export const Roles = (...roles: string[]) => SetMetadata('auth:roles', roles);
export type AuthRequest = IncomingMessage & { identity?: AuthIdentity };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>('auth:public', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const authorization = request.headers.authorization;
    const device = request.headers['x-device-id'];
    request.identity = await this.auth.authenticate(
      authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined,
      typeof device === 'string' ? device : undefined,
    );
    return true;
  }
}
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<string[]>('auth:roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (!request.identity || !roles.includes(request.identity.user.role))
      throw new ForbiddenException('Your account does not have permission.');
    return true;
  }
}
