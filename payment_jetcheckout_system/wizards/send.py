# -*- coding: utf-8 -*-
from odoo import models, fields, api, _
from odoo.exceptions import UserError

MAILFIELDS = {
    'subject': 'mail_subject',
    'body_html': 'mail_body',
    'email_from': 'mail_from',
    'email_to': 'mail_to',
    'email_cc': 'mail_cc',
    'reply_to': 'mail_reply_to',
}

MASSMAILFIELDS = ['subject', 'body_html', 'email_from', 'reply_to']


class PaymentAcquirerJetcheckoutSendType(models.Model):
    _name = 'payment.acquirer.jetcheckout.send.type'
    _description = 'Jetcheckout System Send Types'
    _order = 'sequence'
    
    @api.model
    def _selection_target_model(self):
        return [(model.model, model.name) for model in self.env['ir.model'].sudo().search([])]

    @api.model
    def _selection_languages(self):
        return self.env['res.lang'].get_installed()

    def _compute_icon(self):
        for type in self:
            if type.icon:
                type.icon_preview = '<i class="fa ' + type.icon + '"></i>'
            else:
                type.icon_preview = ''

    def _compute_message(self):
        for type in self:
            message = ''
            if type.code == 'email':
                server = self.env['ir.mail_server'].sudo().search([('company_id', '=', type.company_id.id)], limit=1)
                if server:
                    message = _('Emails are going to be sent on %s') % server.smtp_host
                else:
                    message = _('There is not any outgoing mail server set')
            elif type.code == 'sms':
                provider = getattr(type.company_id, 'sms_provider')
                if provider:
                    message = _('SMS messages are going to be sent on %s') % provider.capitalize()
                else:
                    message = _('There is not any SMS provider selected')
            else:
                message = _('This feature is implemented soon')

            type.message = message

    def _compute_params(self):
        for type in self:
            type.company_id = self.env.context.get('company_id')
            type.partner_ids = self.env.context.get('partner_ids')

    def _compute_template(self):
        parent = self.env['payment.acquirer.jetcheckout.send'].browse(self.env.context.get('parent', 0))
        for type in self:
            if type.code == 'email':
                type.mail_template_id = parent.mail_template_id.id
                type.template_name = parent.mail_template_id.name
                type.sms_template_id = False
            elif type.code == 'sms':
                type.sms_template_id = parent.sms_template_id.id
                type.template_name = parent.sms_template_id.name
                type.mail_template_id = False
            else:
                type.template_name = 'Empty'
                type.mail_template_id = False
                type.sms_template_id = False

    def _set_template(self):
        parent = self.env['payment.acquirer.jetcheckout.send'].browse(self.env.context.get('parent', 0))
        for type in self:
            if type.code == 'email':
                parent.mail_template_id = type.mail_template_id.id
            elif type.code == 'sms':
                parent.sms_template_id = type.sms_template_id.id

    def _set_mail_attributes(self, values=None):
        for key, val in MAILFIELDS.items():
            field_value = values.get(key, False) if values else self.mail_template_id[key]
            self[val] = field_value

    @api.onchange('mail_template_id', 'partner_id', 'lang')
    def _compute_mail_fields(self):
        for type in self:
            try:
                if type.mail_template_id:
                    template = type.mail_template_id.with_context(lang=type.lang)
                    if self.partner_id:
                        values = template.with_context(template_preview_lang=type.lang).generate_email(type.partner_id.id, MAILFIELDS.keys())
                        type._set_mail_attributes(values=values)
                    else:
                        type._set_mail_attributes()
                else:
                    type._set_mail_attributes()

            except Exception as e:
                error = str(e)
                if '\n' in error:
                    error = error.split('\n')[0]
                if ' : ' in error:
                    error = error.split(' : ')[1]
                raise UserError(error)

    @api.onchange('sms_template_id', 'partner_id', 'lang')
    def _compute_sms_fields(self):
        for type in self:
            try:
                if type.sms_template_id:
                    if type.partner_id:
                        type.sms_body = type.sms_template_id._render_field('body', [type.partner_id.id], set_lang=type.lang)[type.partner_id.id]
                    else:
                        type.sms_body = type.sms_template_id.body
                else:
                    type.sms_body = type.sms_template_id.body

            except Exception as e:
                error = str(e)
                if '\n' in error:
                    error = error.split('\n')[0]
                if ' : ' in error:
                    error = error.split(' : ')[1]
                raise UserError(error)

    name = fields.Char(required=True, readonly=True, translate=True)
    code = fields.Char(required=True, readonly=True)
    sequence = fields.Integer(default=16)
    icon = fields.Char()

    icon_preview = fields.Html(compute='_compute_icon', sanitize=False, compute_sudo=True)
    message = fields.Char(compute='_compute_message', compute_sudo=True)
    company_id = fields.Many2one('res.company', compute='_compute_params', compute_sudo=True)
    partner_ids = fields.Many2many('res.partner', compute='_compute_params', compute_sudo=True)
    partner_id = fields.Many2one('res.partner', string='Partner', store=False, default=False)
    lang = fields.Selection(_selection_languages, string='Language', store=False)
    template_name = fields.Char(compute='_compute_template', compute_sudo=True)

    mail_template_id = fields.Many2one('mail.template', string='Email Template', compute='_compute_template', inverse='_set_template', readonly=False, compute_sudo=True)
    mail_subject = fields.Char(compute='_compute_mail_fields', compute_sudo=True)
    mail_from = fields.Char(compute='_compute_mail_fields', compute_sudo=True)
    mail_to = fields.Char(compute='_compute_mail_fields', compute_sudo=True)
    mail_cc = fields.Char(compute='_compute_mail_fields', compute_sudo=True)
    mail_reply_to = fields.Char(compute='_compute_mail_fields', compute_sudo=True)
    mail_body = fields.Html(sanitize=False, compute='_compute_mail_fields', compute_sudo=True)

    sms_template_id = fields.Many2one('sms.template', string='Sms Template', compute='_compute_template', inverse='_set_template', readonly=False, compute_sudo=True)
    sms_body = fields.Text(compute='_compute_sms_fields', compute_sudo=True)

    @api.model
    def create(self, vals):
        if self.env.context.get('readonly'):
            return False
        return super().create(vals)

    def write(self, vals):
        if self.env.context.get('readonly'):
            return False
        return super().write(vals)

    def unlink(self):
        if self.env.context.get('readonly'):
            return False
        return super().unlink()


class PaymentAcquirerJetcheckoutSend(models.TransientModel):
    _name = 'payment.acquirer.jetcheckout.send'
    _description = 'Jetcheckout System Send'

    def _compute_partner(self):
        for send in self:
            send.partner_ids = [(6, 0, self.env.context.get('active_ids', []))]
            send.partner_count = len(send.partner_ids)

    partner_ids = fields.Many2many('res.partner', compute='_compute_partner', string='Partners')
    partner_count = fields.Integer(compute='_compute_partner')
    selection = fields.Many2many('payment.acquirer.jetcheckout.send.type', 'system_send_type_rel', 'send_id', 'type_id', string='Selection')
    type_ids = fields.Many2many('payment.acquirer.jetcheckout.send.type', 'system_send_type_rel', 'send_id', 'type_id', string='Types')
    mail_template_id = fields.Many2one('mail.template')
    sms_template_id = fields.Many2one('sms.template')
    company_id = fields.Many2one('res.company')

    @api.onchange('selection')
    def onchange_selection(self):
        self.type_ids = self.selection

    def send(self):
        selections = self.selection.mapped('code')
        mail_template = 'email' in selections and self.mail_template_id or False
        sms_template = 'sms' in selections and self.sms_template_id or False
        source_id = self.env.ref('payment_jetcheckout_system.send_source').id
        model_id = self.env['ir.model']._get('res.partner').id
        model_domain = '[("id", "=", %s)]'
        reply_to = self.env.user.email_formatted
        company_id = self.company_id.id
        messages = []


        for partner in self.partner_ids:
            if mail_template:
                mail_values = mail_template.with_context(template_preview_lang=partner.lang).generate_email(partner.id, MASSMAILFIELDS)
                del mail_values['body']
                del mail_values['mail_server_id']
                del mail_values['auto_delete']
                del mail_values['model']
                del mail_values['res_id']
                mail_values.update({
                    'mailing_type': 'mail',
                    'state': 'in_queue',
                    'mailing_model_id': model_id,
                    'mailing_domain': model_domain % partner.id,
                    'reply_to': reply_to,
                    'source_id': source_id,
                    'company_id': company_id,
                })
                messages.append(mail_values)

            if sms_template:
                body_plaintext = sms_template._render_field('body', [partner.id], set_lang=partner.lang)[partner.id]
                sms_values = {
                    'mailing_type': 'sms',
                    'state': 'in_queue',
                    'subject': sms_template.name,
                    'body_plaintext': body_plaintext,
                    'mailing_model_id': model_id,
                    'mailing_domain': model_domain % partner.id,
                    'source_id': source_id,
                    'company_id': company_id,
                }
                messages.append(sms_values)

        if messages:
            self.env['mailing.mailing'].create(messages)
            self.env.ref('mass_mailing.ir_cron_mass_mailing_queue')._trigger()
            sent_values = {}
            now = fields.Datetime.now()
            if mail_template:
                sent_values['date_email_sent'] = now
            if sms_template:
                sent_values['date_sms_sent'] = now
            self.partner_ids.write(sent_values)