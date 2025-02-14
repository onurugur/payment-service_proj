# -*- coding: utf-8 -*-
from odoo import models, fields, api


class Website(models.Model):
    _inherit = 'website'

    def _compute_template_ok(self):
        for website in self:
            website.template_ok = bool(website.template_id)

    def _set_template_ok(self):
        for website in self:
            if not website.template_ok:
                website.template_id = False

    template_ok = fields.Boolean('Use Template', compute='_compute_template_ok', inverse='_set_template_ok', readonly=False)
    template_id = fields.Many2one('website', 'Template')

    payment_footer = fields.Html('Footer')
    payment_privacy_policy = fields.Html('Privacy Policy')
    payment_sale_agreement = fields.Html('Sale Agreement')
    payment_membership_agreement = fields.Html('Membership Agreement')
    payment_contact_page = fields.Html('Contact Page')

    def _get_companies(self):
        self = self.sudo()
        if self.env.user.share:
            return self.search([('domain', '=', self.domain)]).mapped('company_id')
        else:
            return self.env.user.company_ids

    @api.model
    def create(self, values):
        if 'template_id' in values and values['template_id']:
            template = self.browse(values['template_id'])
            values['domain'] = template.domain
        return super().create(values)

    def write(self, values):
        if 'template_id' in values and values['template_id']:
            template = self.browse(values['template_id'])
            values['domain'] = template.domain
        return super().write(values)


class View(models.Model):
    _inherit = 'ir.ui.view'

    def _render_template(self, template, values=None, **kw):
        if self.env.context.get('website_id'):
            try:
                if values['main_object']._name == 'website.page':
                    website_id = values['main_object'].website_id.template_id.id
                    if website_id:
                        template = self.env['website'].with_context(website_id=website_id).viewref('website.homepage').id
                        values['response_template'] = template
            except:
                pass
        return super(View, self)._render_template(template, values=values, **kw)