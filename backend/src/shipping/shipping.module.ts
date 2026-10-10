import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { AddressesService } from './addresses.service';
import { MelhorEnvioClient } from './melhor-envio.client';
import { ShipmentsService } from './shipments.service';
import { AddressesController, ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [ShippingController, AddressesController],
  providers: [MelhorEnvioClient, ShippingService, AddressesService, ShipmentsService],
  exports: [ShippingService, AddressesService, ShipmentsService],
})
export class ShippingModule {}
