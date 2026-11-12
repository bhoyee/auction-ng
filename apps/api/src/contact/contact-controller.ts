import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  contactMessageInputSchema,
  contactMessageResultSchema,
} from '@auction-ng/shared';
import { Public, type AuthRequest } from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { clientIp } from '../security/client-ip';
import { ContactService } from './contact-service';

@ApiTags('Contact')
@Controller()
export class ContactController {
  constructor(
    @Inject(ContactService) private readonly contact: ContactService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Post('contact')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Send a message to the support inbox. Retrying with the same requestKey returns the same reference.',
  })
  @ApiBody({
    schema: z.toJSONSchema(contactMessageInputSchema, {
      target: 'openapi-3.0',
      io: 'input',
    }) as SchemaObject,
  })
  @ApiOkResponse({
    schema: z.toJSONSchema(contactMessageResultSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  async send(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const parsed = contactMessageInputSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        'Please check your name, email address and message, then try again.',
      );
    const ip = clientIp(request);
    await this.auth.limitContactRequests(ip, parsed.data.email);
    return this.contact.submit(parsed.data, ip);
  }
}
