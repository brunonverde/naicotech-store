import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { ShippingModule } from '../shipping/shipping.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuditService } from './audit.service';
import { TwoFactorService } from './two-factor.service';

// Global: o AuditService é usado pelo @AdminOnly() em outros módulos (produtos, categorias).
@Global()
@Module({
  imports: [AuthModule, MailModule, ShippingModule],
  controllers: [AdminController],
  providers: [AdminService, AuditService, TwoFactorService],
  exports: [AuditService],
})
export class AdminModule {}
