import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Logger } from '@nestjs/common';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No roles required, allow access
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Ensure user exists and has roles property
    if (!user || !user.roles) {
      this.logger.warn(`Access denied: User missing or has no roles`);
      throw new UnauthorizedException({
        status: 'error',
        error: {
          code: 'access_denied',
          message: 'You do not have permission to access this resource',
        },
      });
    }

    const hasRole = requiredRoles.some((role) => user.roles.includes(role));

    if (!hasRole) {
      const path = request.route.path;
      const method = request.method;
      this.logger.warn(
        `Role permission denied: User ${user.id} with roles [${user.roles}] ` +
          `attempted to access ${method} ${path} requiring roles [${requiredRoles}]`,
      );

      throw new UnauthorizedException({
        status: 'error',
        error: {
          code: 'insufficient_permissions',
          message:
            'You do not have the required permissions to access this resource',
        },
      });
    }

    return true;
  }
}
