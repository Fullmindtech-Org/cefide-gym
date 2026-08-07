import { Module } from '@nestjs/common';
import { MolineteController } from './molinete.controller';

@Module({
  controllers: [MolineteController],
})
export class MolineteModule {}
