CREATE OR REPLACE VIEW public_api.tokens AS
  SELECT tk.layout_id, tk.ordinal, tk.cp_start, tk.cp_end
  FROM tokens tk WHERE tk.layout_id IN (SELECT layout_id FROM public_api.lines);
DROP VIEW IF EXISTS public_api.version_lines;
