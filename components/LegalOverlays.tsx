/**
 * LegalOverlays — Pre-built "Know Your Rights" lower-third citation library.
 *
 * One-tap citation popups for First Amendment auditors and civil rights journalists.
 * Each overlay shows on the stream canvas as a lower-third graphic.
 */

import React, { useState } from 'react';
import { Scale, Shield, Megaphone, Camera, Users, FileText, ChevronDown, ChevronUp, Zap } from 'lucide-react';

export interface LegalCitation {
  id: string;
  category: string;
  shortTitle: string;
  citation: string;
  summary: string;
  icon: string;
}

export const LEGAL_CITATIONS: LegalCitation[] = [
  // First Amendment — Speech & Expression
  {
    id: 'reed-v-gilbert',
    category: 'Free Speech',
    shortTitle: 'Content-Based Restrictions',
    citation: 'Reed v. Town of Gilbert, 576 U.S. 155 (2015)',
    summary: 'Content-based restrictions on speech are presumptively unconstitutional and subject to strict scrutiny.',
    icon: '🗣️',
  },
  {
    id: 'norton-v-springfield',
    category: 'Free Speech',
    shortTitle: 'Panhandling is Protected Speech',
    citation: 'Norton v. City of Springfield, 806 F.3d 411 (7th Cir. 2015)',
    summary: 'Panhandling is protected speech under the First Amendment. Cities cannot ban peaceful solicitation.',
    icon: '🗣️',
  },
  {
    id: 'speet-v-schuette',
    category: 'Free Speech',
    shortTitle: 'Begging as Free Speech',
    citation: 'Speet v. Schuette, 726 F.3d 867 (6th Cir. 2013)',
    summary: 'Begging is a form of protected speech. Anti-begging statutes violate the First Amendment.',
    icon: '🗣️',
  },
  {
    id: 'loper-v-nypd',
    category: 'Free Speech',
    shortTitle: 'Begging Cannot Be Criminalized',
    citation: 'Loper v. New York City Police Dept., 999 F.2d 699 (2d Cir. 1993)',
    summary: 'Begging and panhandling in public spaces is constitutionally protected expressive conduct.',
    icon: '🗣️',
  },
  {
    id: 'schaumburg-v-citizens',
    category: 'Free Speech',
    shortTitle: 'Charitable Solicitation',
    citation: 'Village of Schaumburg v. Citizens for a Better Environment, 444 U.S. 620 (1980)',
    summary: 'Charitable solicitation is protected speech. Broad restrictions on door-to-door solicitation are unconstitutional.',
    icon: '🗣️',
  },
  {
    id: 'mccullen-v-coakley',
    category: 'Free Speech',
    shortTitle: 'Buffer Zones & Free Speech',
    citation: 'McCullen v. Coakley, 573 U.S. 464 (2014)',
    summary: 'Buffer zones restricting speech on public sidewalks must be narrowly tailored to serve a significant government interest.',
    icon: '🗣️',
  },

  // First Amendment — Recording & Press
  {
    id: 'glik-v-cunniffe',
    category: 'Recording Rights',
    shortTitle: 'Right to Record Police',
    citation: 'Glik v. Cunniffe, 655 F.3d 78 (1st Cir. 2011)',
    summary: 'Citizens have a First Amendment right to record police officers performing duties in public.',
    icon: '📹',
  },
  {
    id: 'turner-v-driver',
    category: 'Recording Rights',
    shortTitle: 'Recording Police (5th Cir.)',
    citation: 'Turner v. Driver, 848 F.3d 678 (5th Cir. 2017)',
    summary: 'The First Amendment protects the right to record police performing official duties in public places.',
    icon: '📹',
  },
  {
    id: 'fields-v-philly',
    category: 'Recording Rights',
    shortTitle: 'Recording Police (3rd Cir.)',
    citation: 'Fields v. City of Philadelphia, 862 F.3d 353 (3rd Cir. 2017)',
    summary: 'Recording police activity in public is protected by the First Amendment, even without expressive intent.',
    icon: '📹',
  },
  {
    id: 'aclu-v-alvarez',
    category: 'Recording Rights',
    shortTitle: 'Audio Recording of Police',
    citation: 'ACLU of Illinois v. Alvarez, 679 F.3d 583 (7th Cir. 2012)',
    summary: 'Eavesdropping laws cannot be used to criminalize audio recording of police performing duties in public.',
    icon: '📹',
  },

  // Fourth Amendment — Search & Seizure
  {
    id: 'terry-v-ohio',
    category: 'Search & Seizure',
    shortTitle: 'Stop & Frisk Standards',
    citation: 'Terry v. Ohio, 392 U.S. 1 (1968)',
    summary: 'Police need reasonable suspicion of criminal activity to briefly detain a person. A "hunch" is not enough.',
    icon: '🔍',
  },
  {
    id: 'florida-v-bostick',
    category: 'Search & Seizure',
    shortTitle: 'Consensual Encounters',
    citation: 'Florida v. Bostick, 501 U.S. 429 (1991)',
    summary: 'A police encounter is consensual if a reasonable person would feel free to decline and walk away.',
    icon: '🔍',
  },

  // Civil Rights — Section 1983
  {
    id: 'monell-v-nyc',
    category: 'Civil Rights',
    shortTitle: 'Municipal Liability',
    citation: 'Monell v. Dept. of Social Services, 436 U.S. 658 (1978)',
    summary: 'Cities can be sued under §1983 when their official policies or customs cause constitutional violations.',
    icon: '⚖️',
  },
  {
    id: 'bivens-v-agents',
    category: 'Civil Rights',
    shortTitle: 'Federal Agent Liability',
    citation: 'Bivens v. Six Unknown Named Agents, 403 U.S. 388 (1971)',
    summary: 'Federal agents can be sued personally for violating constitutional rights.',
    icon: '⚖️',
  },

  // Supremacy Clause
  {
    id: 'supremacy-clause',
    category: 'Constitutional Law',
    shortTitle: 'Supremacy Clause',
    citation: 'U.S. Constitution, Article VI, Clause 2',
    summary: 'Federal law and the Constitution are the supreme law of the land. No state or local law can override them.',
    icon: '🏛️',
  },
];

interface LegalOverlaysProps {
  onActivateCitation: (citation: LegalCitation) => void;
  activeCitationId: string | null;
  compact?: boolean;
}

const LegalOverlays: React.FC<LegalOverlaysProps> = ({
  onActivateCitation,
  activeCitationId,
  compact = false,
}) => {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const categories = [...new Set(LEGAL_CITATIONS.map((c) => c.category))];

  const filteredCitations = searchQuery
    ? LEGAL_CITATIONS.filter(
        (c) =>
          c.shortTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.citation.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.summary.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : LEGAL_CITATIONS;

  const categoryIcon = (cat: string) => {
    switch (cat) {
      case 'Free Speech': return <Megaphone size={14} />;
      case 'Recording Rights': return <Camera size={14} />;
      case 'Search & Seizure': return <Shield size={14} />;
      case 'Civil Rights': return <Scale size={14} />;
      case 'Constitutional Law': return <FileText size={14} />;
      default: return <Scale size={14} />;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Scale size={16} className="text-brand-400" />
        <h3 className="text-sm font-bold text-gray-200">Know Your Rights</h3>
      </div>

      <input
        type="text"
        placeholder="Search cases..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full bg-dark-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500"
      />

      {searchQuery ? (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {filteredCitations.map((citation) => (
            <button
              key={citation.id}
              onClick={() => onActivateCitation(citation)}
              className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                activeCitationId === citation.id
                  ? 'bg-brand-500/20 border-brand-500 shadow-lg shadow-brand-500/10'
                  : 'bg-dark-900 border-gray-700 hover:border-gray-600 hover:bg-dark-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">{citation.icon}</span>
                <span className="text-xs font-semibold text-white truncate">{citation.shortTitle}</span>
                {activeCitationId === citation.id && (
                  <span className="ml-auto text-[9px] font-bold text-brand-400 uppercase">ON AIR</span>
                )}
              </div>
              {!compact && (
                <p className="text-[10px] text-gray-400 mt-1 line-clamp-2">{citation.citation}</p>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {categories.map((cat) => {
            const catCitations = filteredCitations.filter((c) => c.category === cat);
            if (catCitations.length === 0) return null;
            const isExpanded = expandedCategory === cat;

            return (
              <div key={cat}>
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : cat)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 hover:border-gray-600 text-sm"
                >
                  {categoryIcon(cat)}
                  <span className="text-xs font-semibold text-gray-200">{cat}</span>
                  <span className="text-[10px] text-gray-500 ml-1">({catCitations.length})</span>
                  <span className="ml-auto text-gray-500">
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </span>
                </button>
                {isExpanded && (
                  <div className="mt-1 ml-2 space-y-1">
                    {catCitations.map((citation) => (
                      <button
                        key={citation.id}
                        onClick={() => onActivateCitation(citation)}
                        className={`w-full text-left p-2 rounded-lg border transition-all ${
                          activeCitationId === citation.id
                            ? 'bg-brand-500/20 border-brand-500'
                            : 'bg-dark-950 border-gray-800 hover:border-gray-600'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Zap size={10} className={activeCitationId === citation.id ? 'text-brand-400' : 'text-gray-600'} />
                          <span className="text-[11px] font-medium text-white">{citation.shortTitle}</span>
                          {activeCitationId === citation.id && (
                            <span className="ml-auto text-[8px] font-bold text-brand-400 bg-brand-500/20 px-1.5 py-0.5 rounded">LIVE</span>
                          )}
                        </div>
                        {!compact && (
                          <p className="text-[10px] text-gray-500 mt-0.5 ml-4">{citation.citation}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeCitationId && (
        <button
          onClick={() => onActivateCitation({ id: '', category: '', shortTitle: '', citation: '', summary: '', icon: '' })}
          className="w-full py-2 rounded-lg bg-red-600/20 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-600/30 transition-colors"
        >
          Clear Citation Overlay
        </button>
      )}
    </div>
  );
};

export default LegalOverlays;
