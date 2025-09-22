import React, { useState, useEffect } from 'react';
import { CheckRule } from '@docmate/shared';

interface CheckRuleManagerProps {
  checkRules: CheckRule[];
  isLoading: boolean;
  onBack: () => void;
  onUpdateRules: (rules: CheckRule[]) => void;
  onCreateRules: (newRules: Omit<CheckRule, 'id' | 'createdAt' | 'updatedAt' | 'isDefault'>[]) => void;
  onDeleteRules: (ruleIds: string[]) => void;
}

export const CheckRuleManager: React.FC<CheckRuleManagerProps> = ({
  checkRules,
  isLoading,
  onBack,
  onUpdateRules,
  onCreateRules,
  onDeleteRules
}) => {
  const [editingRule, setEditingRule] = useState<CheckRule | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [modifiedRules, setModifiedRules] = useState<CheckRule[]>([]);
  const [currentRules, setCurrentRules] = useState<CheckRule[]>(checkRules);

  // 当props.checkRules更新时，同步更新内部状态
  useEffect(() => {
    setCurrentRules(checkRules);
  }, [checkRules]);

  // 处理规则开关切换
  const handleToggleRule = (ruleId: string, enabled: boolean) => {
    const updatedRules = currentRules.map(rule =>
      rule.id === ruleId ? { ...rule, enabled } : rule
    );
    setCurrentRules(updatedRules);
    // 立即保存更改
    onUpdateRules(updatedRules);
  };

  // 处理保存更改
  const handleSaveChanges = () => {
    onUpdateRules(modifiedRules);
    setHasUnsavedChanges(false);
    setModifiedRules([]);
  };

  // 处理重置
  const handleReset = () => {
    setModifiedRules([]);
    setHasUnsavedChanges(false);
  };

  // 处理编辑规则
  const handleEditRule = (rule: CheckRule) => {
    if (!rule.isDefault) {
      setEditingRule(rule);
    }
  };

  // 处理删除规则
  const handleDeleteRule = (ruleId: string) => {
    onDeleteRules([ruleId]);
    setHasUnsavedChanges(false);
    setModifiedRules([]);
  };

  // 当前显示的规则（优先显示修改后的）
  const displayRules = modifiedRules.length > 0 ? modifiedRules : checkRules;

  // 按类型分组
  const rulesByType = displayRules.reduce((acc, rule) => {
    if (!acc[rule.type]) {
      acc[rule.type] = [];
    }
    acc[rule.type].push(rule);
    return acc;
  }, {} as Record<string, CheckRule[]>);

  const typeLabels: Record<string, string> = {
    'TYPO': '错别字',
    'PUNCTUATION': '标点符号',
    'SPACING': '空格规范',
    'FORMATTING': '格式规范',
    'STYLE': '风格一致性',
    'HYPERLINK_ERROR': '超链接检查',
    'TERMINOLOGY': '术语规范'
  };

  if (isLoading) {
    return (
      <div className="check-rules-manager">
        <div className="check-rules-header">
          <button className="back-button" onClick={onBack}>← 返回</button>
          <h2>规则管理</h2>
        </div>
        <div className="loading-container">
          <div className="loading-spinner">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="check-rules-manager">
      <div className="check-rules-header">
        <button className="back-button" onClick={onBack}>← 返回</button>
        <div>
          <h2>规则管理</h2>
          <p className="rules-description">
            管理文本检查规则。默认规则（带"默认"标签）为系统内置，只能启用/禁用；
            自定义规则可以编辑、删除和创建。
          </p>
        </div>
        <button
          className="create-rule-button"
          onClick={() => setShowCreateModal(true)}
        >
          新建规则
        </button>
      </div>

      <div className="check-rules-content">
        {Object.entries(rulesByType).map(([type, rules]) => (
          <div key={type} className="rule-type-section">
            <h3 className="rule-type-title">{typeLabels[type] || type}</h3>
            <div className="rules-list">
              {rules.map(rule => (
                <div key={rule.id} className={`rule-item ${rule.isDefault ? 'default-rule' : 'custom-rule'}`}>
                  <div className="rule-info">
                    <div className="rule-header">
                      <h4 className="rule-name">{rule.name}</h4>
                      {rule.isDefault && <span className="default-badge">默认</span>}
                    </div>
                    <p className="rule-description">{rule.description}</p>
                    <div className="rule-content-preview">
                      <strong>规则内容：</strong>
                      <span>{rule.content}</span>
                    </div>
                  </div>

                  <div className="rule-controls">
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) => handleToggleRule(rule.id, e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>

                    <div className="rule-actions">
                      {!rule.isDefault && (
                        <>
                          <button
                            className="edit-button"
                            onClick={() => handleEditRule(rule)}
                          >
                            编辑
                          </button>
                          <button
                            className="delete-button"
                            onClick={() => handleDeleteRule(rule.id)}
                          >
                            删除
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {hasUnsavedChanges && (
        <div className="unsaved-changes-bar">
          <span>有未保存的更改</span>
          <div className="action-buttons">
            <button className="reset-button" onClick={handleReset}>重置</button>
            <button className="save-button" onClick={handleSaveChanges}>保存更改</button>
          </div>
        </div>
      )}

      {/* 编辑规则模态框 */}
      {editingRule && (
        <RuleModal
          rule={editingRule}
          isReadOnly={editingRule.isDefault}
          onSave={async (updatedRule) => {
            await onUpdateRules([updatedRule]);
            setEditingRule(null);
            setHasUnsavedChanges(false);
            setModifiedRules([]);
            return true;
          }}
          onClose={() => setEditingRule(null)}
        />
      )}

      {/* 创建规则模态框 */}
      {showCreateModal && (
        <RuleModal
          rule={null}
          isReadOnly={false}
          onSave={async (newRule) => {
            const ruleToCreate = { ...newRule };
            delete (ruleToCreate as any).id;
            delete (ruleToCreate as any).createdAt;
            delete (ruleToCreate as any).updatedAt;
            delete (ruleToCreate as any).isDefault;

            await onCreateRules([ruleToCreate]);
            setShowCreateModal(false);
            setHasUnsavedChanges(false);
            setModifiedRules([]);
            return true;
          }}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
};

interface RuleModalProps {
  rule: CheckRule | null;
  isReadOnly: boolean;
  onSave: (rule: CheckRule) => Promise<boolean>;
  onClose: () => void;
}

const RuleModal: React.FC<RuleModalProps> = ({ rule, isReadOnly, onSave, onClose }) => {
  const [formData, setFormData] = useState<Partial<CheckRule>>(rule || {
    name: '',
    type: 'TYPO',
    description: '',
    content: '',
    enabled: true
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.description || !formData.content) {
      alert('请填写所有必填字段');
      return;
    }

    setIsSaving(true);
    try {
      const ruleToSave: CheckRule = {
        id: rule?.id || `temp-${Date.now()}`,
        name: formData.name!,
        type: formData.type!,
        description: formData.description!,
        content: formData.content!,
        enabled: formData.enabled!,
        isDefault: rule?.isDefault || false,
        createdAt: rule?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const success = await onSave(ruleToSave);
      if (success) {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>{rule ? (isReadOnly ? '查看规则' : '编辑规则') : '新建规则'}</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="rule-form">
          <div className="form-group">
            <label htmlFor="rule-name">规则名称 *</label>
            <input
              id="rule-name"
              type="text"
              value={formData.name || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              disabled={isReadOnly}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="rule-type">规则类型 *</label>
            <select
              id="rule-type"
              value={formData.type || 'TYPO'}
              onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as any }))}
              disabled={isReadOnly || rule?.isDefault}
              required
            >
              <option value="TYPO">错别字</option>
              <option value="PUNCTUATION">标点符号</option>
              <option value="SPACING">空格规范</option>
              <option value="FORMATTING">格式规范</option>
              <option value="STYLE">风格一致性</option>
              <option value="HYPERLINK_ERROR">超链接检查</option>
              <option value="TERMINOLOGY">术语规范</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="rule-description">规则描述 *</label>
            <textarea
              id="rule-description"
              value={formData.description || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              disabled={isReadOnly}
              required
              rows={3}
            />
          </div>

          <div className="form-group">
            <label htmlFor="rule-content">规则内容 *</label>
            <textarea
              id="rule-content"
              value={formData.content || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
              disabled={isReadOnly}
              required
              rows={6}
              placeholder="请详细描述检查规则的具体内容和要求..."
            />
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.enabled || false}
                onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
                disabled={isReadOnly}
              />
              启用此规则
            </label>
          </div>

          <div className="form-actions">
            <button type="button" className="cancel-button" onClick={onClose}>
              取消
            </button>
            {!isReadOnly && (
              <button type="submit" className="save-button" disabled={isSaving}>
                {isSaving ? '保存中...' : '保存'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};