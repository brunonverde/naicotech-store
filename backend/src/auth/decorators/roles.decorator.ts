import { SetMetadata } from '@nestjs/common';

export const Roles = (...roles: Array<'ADMIN' | 'CUSTOMER'>) =>
  SetMetadata('roles', roles);
